import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

import { HistoryStatus } from '../../generated/prisma/client';

import {
  InvalidPollyTextError,
  UnsupportedPollyLanguageError,
} from '../../integrations/polly/polly.errors';
import { PollyService } from '../../integrations/polly/polly.service';
import type { SynthesizedSpeech } from '../../integrations/polly/polly.types';

import {
  TWILIO_VOICE_CALL_KEY_PREFIX,
  TWILIO_VOICE_CALL_TTL_SECONDS,
} from '../../integrations/twilio/twilio-voice.constants';

import { RedisService } from '../../integrations/redis/redis.service';

import { PushNotificationService } from '../../modules/push-notification/push-notification.service';
import { ReminderHistoryService } from '../../modules/reminder-history/reminder-history.service';
import { VoiceCallService } from '../../modules/voice-call/voice-call.service';

import { PrismaService } from '../../prisma/prisma.service';

import {
  JOB_NAMES,
  QUEUE_NAMES,
  VOICE_JOB_STATE_PREFIXES,
} from '../constants/queue.constants';

import { ReminderJobData } from '../interfaces/reminder-job-data.interface';
import { SchedulerService } from '../scheduler.service';

@Processor(QUEUE_NAMES.VOICE_CALL)
export class VoiceCallProcessor {
  private readonly logger = new Logger(VoiceCallProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly pollyService: PollyService,
    private readonly voiceCallService: VoiceCallService,
    private readonly schedulerService: SchedulerService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly reminderHistoryService: ReminderHistoryService,
  ) {}

  @Process(JOB_NAMES.MAKE_VOICE_CALL)
  async handleVoiceCall(job: Job<ReminderJobData>): Promise<void> {
    this.logger.log(`Voice call job başladı. Job ID: ${job.id}`);

    const reminder = await this.prisma.reminder.findUnique({
      where: {
        reminderId: job.data.reminderId,
      },
      include: {
        user: {
          include: {
            devices: true,
            userSetting: {
              include: {
                language: true,
              },
            },
          },
        },
        voiceCallSettings: true,
      },
    });

    if (!reminder) {
      this.logger.warn(`Reminder bulunamadı: ${job.data.reminderId}`);
      return;
    }

    if (reminder.status !== 'ACTIVE') {
      this.logger.warn(`Reminder aktif değil: ${reminder.reminderId}`);
      return;
    }

    const voiceSetting = reminder.voiceCallSettings.find(
      (setting) => setting.callId === job.data.settingId,
    );

    if (!voiceSetting || !voiceSetting.enabled) {
      this.logger.warn(`Voice call setting aktif değil: ${job.data.settingId}`);
      return;
    }

    const jobId = String(job.id);

    const processingJobId = `${VOICE_JOB_STATE_PREFIXES.PROCESSING}${jobId}`;

    const attemptingJobId = `${VOICE_JOB_STATE_PREFIXES.ATTEMPTING}${jobId}`;

    const scheduledFor =
      job.data.scheduledFor ?? reminder.eventDatetime.toISOString();

    const recoveringProcessingJob = voiceSetting.jobId === processingJobId;

    /*
     * Aynı job tekrar worker'a geldiğinde,
     * daha önce çağrı başlatılmışsa tekrar çağrı başlatma.
     */
    if (voiceSetting.jobId === attemptingJobId) {
      if (job.attemptsMade === 0) {
        await job.discard();

        throw new Error('Voice call attempt has already started');
      }

      await this.finalizeOccurrence(job, scheduledFor, attemptingJobId);

      return;
    }

    /*
     * Job'ın gerçekten bu setting'e ait olup olmadığını kontrol ediyoruz.
     */
    if (voiceSetting.jobId !== jobId && !recoveringProcessingJob) {
      this.logger.warn(`Voice call job geçerli değil. Job ID: ${jobId}`);

      return;
    }

    /*
     * Job ownership claim.
     */
    const claimedSetting = await this.prisma.voiceCallSetting.updateMany({
      where: {
        callId: voiceSetting.callId,
        enabled: true,
        jobId: recoveringProcessingJob ? processingJobId : jobId,
      },
      data: {
        jobId: processingJobId,
      },
    });

    if (claimedSetting.count !== 1) {
      this.logger.warn(`Voice call job daha önce işlendi. Job ID: ${jobId}`);

      return;
    }

    /*
     * Kullanıcının dil ayarını kontrol et.
     */
    const languageCode = reminder.user.userSetting?.language.code;

    if (!languageCode) {
      await this.finishPermanentFailure(
        job,
        voiceSetting.callId,
        processingJobId,
        attemptingJobId,
        reminder.reminderId,
        scheduledFor,
        'Ses dili yapılandırması bulunamadı.',
      );

      throw new Error('Voice call language configuration is missing');
    }

    /*
     * Polly'ye gönderilecek metin.
     */
    const message = reminder.description
      ? `${reminder.title}. ${reminder.description}`
      : reminder.title;

    let speech: SynthesizedSpeech;

    try {
      speech = await this.pollyService.synthesize({
        text: message,
        languageCode,
      });
    } catch (error: unknown) {
      if (
        error instanceof InvalidPollyTextError ||
        error instanceof UnsupportedPollyLanguageError
      ) {
        await this.finishPermanentFailure(
          job,
          voiceSetting.callId,
          processingJobId,
          attemptingJobId,
          reminder.reminderId,
          scheduledFor,
          'Ses içeriği üretilemedi.',
        );
      }

      this.logger.error('Voice call speech synthesis failed.');

      throw error;
    }

    /*
     * Artık gerçekten Twilio çağrı denemesine geçiyoruz.
     */
    const callAttempt = await this.prisma.voiceCallSetting.updateMany({
      where: {
        callId: voiceSetting.callId,
        enabled: true,
        jobId: processingJobId,
      },
      data: {
        jobId: attemptingJobId,
      },
    });

    if (callAttempt.count !== 1) {
      this.logger.warn(`Voice call job sahipliği kaybedildi. Job ID: ${jobId}`);

      return;
    }

    const currentAttempt = job.data.attempt ?? job.attemptsMade + 1;

    let callResult: {
      callSid: string;
      status: string;
    };

    try {
      callResult = await this.voiceCallService.makeCall(
        reminder.user.phoneNumber,
        speech,
      );
    } catch (error: unknown) {
      /*
       * Twilio API çağrıyı başlatamadı.
       *
       * Bu durumda gerçek bir CallSid olmadığı için
       * webhook bekleyemeyiz.
       *
       * İlk denemeyse Bull 2 dakika sonra aynı job'ı
       * tekrar çalıştıracak.
       */
      await this.recordHistory(
        reminder.reminderId,
        HistoryStatus.FAILED,
        currentAttempt,
        'Sesli arama sağlayıcısı çağrıyı başlatamadı.',
      );

      if (currentAttempt < 2) {
        await this.prisma.voiceCallSetting.updateMany({
          where: {
            callId: voiceSetting.callId,
            enabled: true,
            jobId: attemptingJobId,
          },
          data: {
            jobId: jobId,
          },
        });

        this.logger.warn(
          `Voice call başarısız oldu. ` +
            `Sonraki deneme 2 dakika sonra yapılacak. ` +
            `Reminder ID: ${reminder.reminderId}`,
        );

        throw error;
      }

      /*
       * İkinci deneme de API seviyesinde başarısızsa
       * artık yeni çağrı başlatma.
       */
      await this.finalizeOccurrence(job, scheduledFor, attemptingJobId);

      this.logger.error(
        `Voice call maksimum deneme sayısına ulaştı. ` +
          `Reminder ID: ${reminder.reminderId}`,
      );

      return;
    }

    /*
     * Twilio çağrıyı başlattı.
     *
     * BURADA SUCCESS YAZMIYORUZ.
     *
     * Çünkü client.calls.create() başarılı olması,
     * kullanıcının telefonu açtığı anlamına gelmez.
     *
     * Gerçek sonucu Twilio status callback üzerinden
     * öğreneceğiz.
     */
    const historyId = await this.recordHistory(
      reminder.reminderId,
      HistoryStatus.PENDING,
      currentAttempt,
    );

    await this.redisService.setWithExpiry(
      this.createCallKey(callResult.callSid),
      JSON.stringify({
        reminderId: reminder.reminderId,
        userId: reminder.userId,
        settingId: voiceSetting.callId,
        scheduledFor,
        attempt: currentAttempt,
        jobId,
        historyId,
      }),
      TWILIO_VOICE_CALL_TTL_SECONDS,
    );

    await this.sendCallStartedNotifications(
      reminder.reminderId,
      reminder.title,
      reminder.user.devices,
    );

    this.logger.log(
      `Voice call başlatıldı. ` +
        `Call SID: ${callResult.callSid}, ` +
        `Attempt: ${currentAttempt}`,
    );

    /*
     * DİKKAT:
     *
     * Burada finalizeOccurrence YOK.
     *
     * Reminder ancak Twilio callback sonucundan sonra
     * tamamlanacak veya retry edilecek.
     */
  }

  private createCallKey(callSid: string): string {
    return `${TWILIO_VOICE_CALL_KEY_PREFIX}${callSid}`;
  }

  private async finishPermanentFailure(
    job: Job<ReminderJobData>,
    callId: string,
    processingJobId: string,
    attemptingJobId: string,
    reminderId: string,
    scheduledFor: string,
    errorMessage: string,
  ): Promise<void> {
    const permanentAttempt = await this.prisma.voiceCallSetting.updateMany({
      where: {
        callId,
        enabled: true,
        jobId: processingJobId,
      },
      data: {
        jobId: attemptingJobId,
      },
    });

    if (permanentAttempt.count !== 1) {
      return;
    }

    await this.recordHistory(
      reminderId,
      HistoryStatus.FAILED,
      job.data.attempt ?? job.attemptsMade + 1,
      errorMessage,
    );

    await this.finalizeOccurrence(job, scheduledFor, attemptingJobId);

    await job.discard();
  }

  private async recordHistory(
    reminderId: string,
    status: HistoryStatus,
    attempt: number,
    errorMessage?: string,
  ): Promise<string | null> {
    try {
      const history = await this.reminderHistoryService.create({
        reminderId,
        historyType: 'VOICE_CALL',
        status,
        provider: 'TWILIO',
        sentAt: new Date(),
        attempt,
        errorMessage,
      });

      return history.historyId;
    } catch (error: unknown) {
      this.logger.error(
        'Voice call geçmişi kaydedilemedi.',
        error instanceof Error ? error.stack : undefined,
      );

      return null;
    }
  }

  private async sendCallStartedNotifications(
    reminderId: string,
    reminderTitle: string,
    devices: Array<{
      isActive: boolean;
      pushToken: string | null;
    }>,
  ): Promise<void> {
    try {
      const activeDevices = devices.filter(
        (device) => device.isActive && device.pushToken,
      );

      for (const device of activeDevices) {
        await this.pushNotificationService.sendToDevice(
          device.pushToken as string,
          '📞 Sesli Hatırlatma',
          `${reminderTitle}: Sesli arama tetiklendi.`,
          reminderId,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        'Voice call push bildirimi gönderilemedi.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async finalizeOccurrence(
    job: Job<ReminderJobData>,
    scheduledFor: string,
    attemptingJobId: string,
  ): Promise<void> {
    await this.schedulerService.handleRecurringReminder(
      job.data.reminderId,
      scheduledFor,
      job.data.settingId,
    );

    await this.prisma.voiceCallSetting.updateMany({
      where: {
        callId: job.data.settingId,
        jobId: attemptingJobId,
      },
      data: {
        jobId: null,
      },
    });
  }
}
