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
      where: { reminderId: job.data.reminderId },
      include: {
        user: {
          include: {
            devices: true,
            userSetting: {
              include: { language: true },
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

    if (voiceSetting.jobId === attemptingJobId) {
      if (job.attemptsMade === 0) {
        await job.discard();
        throw new Error('Voice call attempt has already started');
      }

      await this.finalizeOccurrence(job, scheduledFor, attemptingJobId);
      return;
    }

    if (voiceSetting.jobId !== jobId && !recoveringProcessingJob) {
      this.logger.warn(`Voice call job geçerli değil. Job ID: ${jobId}`);
      return;
    }

    const claimedSetting = await this.prisma.voiceCallSetting.updateMany({
      where: {
        callId: voiceSetting.callId,
        enabled: true,
        jobId: recoveringProcessingJob ? processingJobId : jobId,
      },
      data: { jobId: processingJobId },
    });
    if (claimedSetting.count !== 1) {
      this.logger.warn(`Voice call job daha önce işlendi. Job ID: ${jobId}`);
      return;
    }

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

    const callAttempt = await this.prisma.voiceCallSetting.updateMany({
      where: {
        callId: voiceSetting.callId,
        enabled: true,
        jobId: processingJobId,
      },
      data: { jobId: attemptingJobId },
    });
    if (callAttempt.count !== 1) {
      this.logger.warn(`Voice call job sahipliği kaybedildi. Job ID: ${jobId}`);
      return;
    }

    try {
      await this.voiceCallService.makeCall(reminder.user.phoneNumber, speech);
    } catch (error: unknown) {
      await this.recordHistory(
        reminder.reminderId,
        HistoryStatus.FAILED,
        job.attemptsMade + 1,
        'Sesli arama sağlayıcısı çağrıyı başlatamadı.',
      );

      await this.finalizeOccurrence(job, scheduledFor, attemptingJobId);
      await job.discard();

      this.logger.error('Voice call job başarısız oldu.');
      throw error;
    }

    await this.recordHistory(
      reminder.reminderId,
      HistoryStatus.SUCCESS,
      job.attemptsMade + 1,
    );
    await this.sendCallStartedNotifications(
      reminder.reminderId,
      reminder.title,
      reminder.user.devices,
    );
    await this.finalizeOccurrence(job, scheduledFor, attemptingJobId);
    this.logger.log('Voice call başarıyla başlatıldı.');
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
      where: { callId, enabled: true, jobId: processingJobId },
      data: { jobId: attemptingJobId },
    });

    if (permanentAttempt.count !== 1) {
      return;
    }

    await this.recordHistory(
      reminderId,
      HistoryStatus.FAILED,
      job.attemptsMade + 1,
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
  ): Promise<void> {
    try {
      await this.reminderHistoryService.create({
        reminderId,
        historyType: 'VOICE_CALL',
        status,
        provider: 'TWILIO',
        sentAt: new Date(),
        attempt,
        errorMessage,
      });
    } catch (error: unknown) {
      this.logger.error(
        'Voice call geçmişi kaydedilemedi.',
        error instanceof Error ? error.stack : undefined,
      );
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
      data: { jobId: null },
    });
  }
}
