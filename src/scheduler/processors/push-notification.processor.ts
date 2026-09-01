import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

import { PushNotificationService } from '../../modules/push-notification/push-notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  JOB_NAMES,
  PUSH_JOB_STATE_PREFIXES,
  QUEUE_NAMES,
} from '../constants/queue.constants';
import { ReminderJobData } from '../interfaces/reminder-job-data.interface';
import { SchedulerService } from '../scheduler.service';

@Processor(QUEUE_NAMES.PUSH_NOTIFICATION)
export class PushNotificationProcessor {
  private readonly logger = new Logger(PushNotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerService: SchedulerService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  @Process(JOB_NAMES.SEND_PUSH_NOTIFICATION)
  async handlePushNotification(job: Job<ReminderJobData>): Promise<void> {
    this.logger.log(`Push notification job başladı. Job ID: ${job.id}`);

    const reminder = await this.prisma.reminder.findUnique({
      where: { reminderId: job.data.reminderId },
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

    if (!reminder || reminder.status !== 'ACTIVE') {
      return;
    }

    const pushSetting = reminder.pushNotifications.find(
      (setting) => setting.pushId === job.data.settingId,
    );
    if (!pushSetting || !pushSetting.enabled) {
      return;
    }

    const jobId = String(job.id);
    const processingJobId = `${PUSH_JOB_STATE_PREFIXES.PROCESSING}${jobId}`;
    const attemptingJobId = `${PUSH_JOB_STATE_PREFIXES.ATTEMPTING}${jobId}`;
    const scheduledFor =
      job.data.scheduledFor ?? reminder.eventDatetime.toISOString();

    if (pushSetting.jobId === attemptingJobId) {
      if (job.attemptsMade === 0) {
        this.logger.warn(
          `Push notification job zaten işleniyor. Job ID: ${jobId}`,
        );
        return;
      }

      await this.finalizeOccurrence(job, scheduledFor, attemptingJobId);
      return;
    }

    const recoveringProcessingJob = pushSetting.jobId === processingJobId;
    if (pushSetting.jobId !== jobId && !recoveringProcessingJob) {
      this.logger.warn(`Push notification job geçerli değil. Job ID: ${jobId}`);
      return;
    }

    const claimedSetting = await this.prisma.pushNotificationSetting.updateMany(
      {
        where: {
          pushId: pushSetting.pushId,
          enabled: true,
          jobId: recoveringProcessingJob ? processingJobId : jobId,
        },
        data: { jobId: processingJobId },
      },
    );
    if (claimedSetting.count !== 1) {
      return;
    }

    const deliveryAttempt =
      await this.prisma.pushNotificationSetting.updateMany({
        where: {
          pushId: pushSetting.pushId,
          enabled: true,
          jobId: processingJobId,
        },
        data: { jobId: attemptingJobId },
      });
    if (deliveryAttempt.count !== 1) {
      return;
    }

    if (reminder.user.userSetting?.notificationsEnabled === false) {
      await this.finalizeOccurrence(job, scheduledFor, attemptingJobId);
      return;
    }

    const activeDevices = reminder.user.devices.filter(
      (device) => device.isActive && device.pushToken,
    );
    if (activeDevices.length === 0) {
      await this.recordHistory(
        reminder.reminderId,
        'FAILED',
        job.attemptsMade + 1,
        'Aktif push bildirimi cihazı bulunamadı.',
      );
      await this.finalizeOccurrence(job, scheduledFor, attemptingJobId);
      return;
    }

    const body = reminder.description ?? 'Hatırlatıcınızın zamanı yaklaşıyor.';
    let successCount = 0;

    try {
      for (const device of activeDevices) {
        const result = await this.pushNotificationService.sendToDevice(
          device.pushToken as string,
          reminder.title,
          body,
          reminder.reminderId,
        );

        if (result.success) {
          successCount += 1;
        }
      }
    } catch (error: unknown) {
      await this.recordHistory(
        reminder.reminderId,
        'FAILED',
        job.attemptsMade + 1,
        'Push bildirimi gönderilemedi.',
      );

      await this.finalizeOccurrence(job, scheduledFor, attemptingJobId);
      await job.discard();

      throw error;
    }

    const failedCount = activeDevices.length - successCount;
    await this.recordHistory(
      reminder.reminderId,
      successCount > 0 ? 'SUCCESS' : 'FAILED',
      job.attemptsMade + 1,
      failedCount > 0
        ? successCount > 0
          ? 'Bazı cihazlara push bildirimi gönderilemedi.'
          : 'Push bildirimi gönderilemedi.'
        : undefined,
    );
    await this.finalizeOccurrence(job, scheduledFor, attemptingJobId);
  }

  private async recordHistory(
    reminderId: string,
    status: 'SUCCESS' | 'FAILED',
    attempt: number,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.prisma.reminderHistory.create({
        data: {
          reminderId,
          historyType: 'PUSH',
          status,
          provider: 'FCM',
          sentAt: status === 'SUCCESS' ? new Date() : undefined,
          attempt,
          errorMessage,
        },
      });
    } catch {
      this.logger.error('Push notification geçmişi kaydedilemedi.');
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
    await this.prisma.pushNotificationSetting.updateMany({
      where: {
        pushId: job.data.settingId,
        jobId: attemptingJobId,
      },
      data: { jobId: '' },
    });
  }
}
