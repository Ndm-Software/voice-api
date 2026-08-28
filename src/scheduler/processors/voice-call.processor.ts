import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

import { JOB_NAMES, QUEUE_NAMES } from '../constants/queue.constants';
import { ReminderJobData } from '../interfaces/reminder-job-data.interface';
import { SchedulerService } from '../scheduler.service';

import { PrismaService } from '../../prisma/prisma.service';
import { VoiceCallService } from '../../modules/voice-call/voice-call.service';
import { PushNotificationService } from '../../modules/push-notification/push-notification.service';
import { ReminderHistoryService } from '../../modules/reminder-history/reminder-history.service';

import { HistoryStatus } from '../../generated/prisma/client';

@Processor(QUEUE_NAMES.VOICE_CALL)
export class VoiceCallProcessor {
  private readonly logger = new Logger(VoiceCallProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerService: SchedulerService,
    private readonly voiceCallService: VoiceCallService,
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
      this.logger.warn(
        `Voice call setting aktif değil: ${job.data.settingId}`,
      );
      return;
    }

    const rawPhoneNumber = reminder.user.phoneNumber;

    if (!rawPhoneNumber) {
      this.logger.warn(
        `Kullanıcının telefon numarası bulunamadı. User ID: ${reminder.userId}`,
      );

      try {
        await this.reminderHistoryService.create({
          reminderId: reminder.reminderId,
          historyType: 'VOICE_CALL',
          status: HistoryStatus.FAILED,
          sentAt: new Date(),
          errorMessage: 'Kullanıcının telefon numarası bulunamadı.',
        });

        this.logger.log(
          `Voice call başarısız geçmişe kaydedildi: ${reminder.reminderId}`,
        );
      } catch (historyError) {
        this.logger.error(
          'Voice call geçmişe kaydedilirken hata oluştu:',
          historyError,
        );
      }

      await this.schedulerService.handleRecurringReminder(
        reminder.reminderId,
      );

      return;
    }

    const phoneNumber = rawPhoneNumber.startsWith('+')
      ? rawPhoneNumber
      : `+90${rawPhoneNumber.replace(/^0/, '')}`;

    const message = reminder.description
      ? `${reminder.title}. ${reminder.description}`
      : reminder.title;

    this.logger.log(`Voice call hedef numara: ${phoneNumber}`);
    this.logger.log(`Okunacak mesaj: ${message}`);

    const result = await this.voiceCallService.makeCall(
      phoneNumber,
      message,
    );

    try {
      await this.reminderHistoryService.create({
        reminderId: reminder.reminderId,
        historyType: 'VOICE_CALL',
        status: result.success
          ? HistoryStatus.SUCCESS
          : HistoryStatus.FAILED,
        sentAt: new Date(),
        errorMessage: result.error || undefined,
      });

      this.logger.log(
        `Voice call geçmişe kaydedildi: ${reminder.reminderId}`,
      );
    } catch (historyError) {
      this.logger.error(
        'Voice call geçmişe kaydedilirken hata oluştu:',
        historyError,
      );
    }

    try {
      const activeDevices = reminder.user.devices.filter(
        (device) => device.isActive && device.pushToken !== null,
      );

      if (activeDevices.length === 0) {
        this.logger.warn(
          `Voice call bildirimi için aktif cihaz bulunamadı. User ID: ${reminder.userId}`,
        );
      }

      for (const device of activeDevices) {
        if (!device.pushToken) {
          continue;
        }

        await this.pushNotificationService.sendToDevice(
          device.pushToken,
          '📞 Sesli Hatırlatma',
          `${reminder.title}: Sesli arama tetiklendi.`,
          reminder.reminderId,
        );
      }

      if (activeDevices.length > 0) {
        this.logger.log(
          `Voice call push bildirimi gönderildi. User ID: ${reminder.userId}`,
        );
      }
    } catch (pushError) {
      this.logger.error(
        'Voice call push bildirimi gönderilirken hata oluştu:',
        pushError,
      );
    }

    if (result.success) {
      this.logger.log(
        `Voice call tamamlandı. Call SID: ${result.callSid}`,
      );
    } else {
      this.logger.error(
        `Voice call başarısız. Hata: ${result.error}`,
      );
    }

    await this.schedulerService.handleRecurringReminder(
      job.data.reminderId,
    );
  }
}