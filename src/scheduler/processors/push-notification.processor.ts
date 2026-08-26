import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../constants/queue.constants';

import { ReminderJobData } from '../interfaces/reminder-job-data.interface';

import { PrismaService } from '../../prisma/prisma.service';
import { PushNotificationService } from '../../modules/push-notification/push-notification.service';

@Processor(QUEUE_NAMES.PUSH_NOTIFICATION)
export class PushNotificationProcessor {
  private readonly logger =
    new Logger(PushNotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  @Process(JOB_NAMES.SEND_PUSH_NOTIFICATION)
  async handlePushNotification(
    job: Job<ReminderJobData>,
  ): Promise<void> {
  
     const executedAt = new Date();

  this.logger.log(
    '==============================================',
  );
    this.logger.log(
    `🔔 PUSH JOB ZAMANI GELDİ VE ÇALIŞTI`,
  );

  this.logger.log(
    `Job ID: ${job.id}`,
  );

  this.logger.log(
    `Reminder ID: ${job.data.reminderId}`,
  );

  this.logger.log(
    `Çalışma zamanı UTC: ${executedAt.toISOString()}`,
  );

  this.logger.log(
    `Çalışma zamanı local: ${executedAt.toLocaleString('tr-TR')}`,
  );

  this.logger.log(
    '==============================================',
  );


    const reminder =
      await this.prisma.reminder.findUnique({
        where: {
          reminderId: job.data.reminderId,
        },
        include: {
          pushNotifications: true,

          user: {
            include: {
              userSetting: true,
              devices: true,
            },
          },
        },
      });

    if (!reminder) {
      this.logger.warn(
        `Reminder bulunamadı: ${job.data.reminderId}`,
      );

      return;
    }

    if (reminder.status !== 'ACTIVE') {
      this.logger.warn(
        `Reminder aktif değil: ${reminder.reminderId}`,
      );

      return;
    }

    const pushSetting =
      reminder.pushNotifications.find(
        (setting) =>
          setting.pushId === job.data.settingId,
      );

    if (!pushSetting || !pushSetting.enabled) {
      this.logger.warn(
        `Push notification setting aktif değil: ${job.data.settingId}`,
      );

      return;
    }

    // Kullanıcı bildirimleri genel olarak kapattıysa gönderme.
    if (
      reminder.user.userSetting?.notificationsEnabled ===
      false
    ) {
      this.logger.warn(
        `Kullanıcının bildirimleri kapalı. User ID: ${reminder.userId}`,
      );

      return;
    }

    /*
     * Sadece:
     * - aktif
     * - push token sahibi
     *
     * cihazlara bildirim gönderiyoruz.
     */
    const devices = reminder.user.devices.filter(
      (device) =>
        device.isActive &&
        device.pushToken !== null,
    );

    if (devices.length === 0) {
      this.logger.warn(
        `Aktif push token bulunan cihaz yok. User ID: ${reminder.userId}`,
      );

      await this.prisma.reminderHistory.create({
        data: {
          reminderId: reminder.reminderId,
          historyType: 'PUSH',
          status: 'FAILED',
          provider: 'FCM',
          attempt: 1,
          errorMessage:
            'Aktif push token bulunan cihaz yok.',
        },
      });

      return;
    }

    const title = reminder.title;

    const body =
      reminder.description ??
      'Hatırlatıcınızın zamanı yaklaşıyor.';

    let successCount = 0;
    const errors: string[] = [];

    for (const device of devices) {
      if (!device.pushToken) {
        continue;
      }

      this.logger.log(
        `Push gönderiliyor. Device ID: ${device.deviceId}`,
      );

      const result =
        await this.pushNotificationService.sendToDevice(
          device.pushToken,
          title,
          body,
          reminder.reminderId,
        );

      if (result.success) {
        successCount += 1;
      } else {
        errors.push(
          result.error ??
            `Device ${device.deviceId} için bilinmeyen hata.`,
        );
      }
    }

    /*
     * En az bir cihaza başarıyla gittiyse
     * bu push olayını SUCCESS kabul ediyoruz.
     */
    if (successCount > 0) {
      await this.prisma.reminderHistory.create({
        data: {
          reminderId: reminder.reminderId,
          historyType: 'PUSH',
          status: 'SUCCESS',
          provider: 'FCM',
          sentAt: new Date(),
          attempt: 1,
          errorMessage:
            errors.length > 0
              ? errors.join(' | ')
              : null,
        },
      });

      this.logger.log(
        `Push notification tamamlandı. Başarılı cihaz: ${successCount}/${devices.length}`,
      );

      return;
    }

    await this.prisma.reminderHistory.create({
      data: {
        reminderId: reminder.reminderId,
        historyType: 'PUSH',
        status: 'FAILED',
        provider: 'FCM',
        attempt: 1,
        errorMessage:
          errors.join(' | ') ||
          'Push notification gönderilemedi.',
      },
    });

    this.logger.error(
      `Push notification hiçbir cihaza gönderilemedi.`,
    );
  }
}