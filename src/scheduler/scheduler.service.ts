import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { PrismaService } from '../prisma/prisma.service';

import {
  JOB_NAMES,
  QUEUE_NAMES,
} from './constants/queue.constants';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,

    @InjectQueue(QUEUE_NAMES.PUSH_NOTIFICATION)
    private readonly pushQueue: Queue,

    @InjectQueue(QUEUE_NAMES.VOICE_CALL)
    private readonly voiceCallQueue: Queue,
  ) {}

  async scheduleReminder(reminderId: string) {
    this.logger.log(
  `scheduleReminder başladı. Reminder ID: ${reminderId}`,
);
    const reminder = await this.prisma.reminder.findUnique({
      where: {
        reminderId,
      },
      include: {
        pushNotifications: true,
        voiceCallSettings: true,
      },
    });
    

    if (!reminder) {
      throw new NotFoundException('Reminder not found.');
    }

    if (reminder.status !== 'ACTIVE') {
      this.logger.warn(
        `Reminder ${reminderId} aktif değil. Job oluşturulmadı.`,
      );

      return;
    }
    this.logger.log(
  `Reminder bulundu. Push: ${reminder.pushNotifications.length}, Voice: ${reminder.voiceCallSettings.length}`,
);

    for (const pushSetting of reminder.pushNotifications) {
      if (!pushSetting.enabled) {
        continue;
      }

      await this.schedulePushJob(
        reminder.reminderId,
        reminder.userId,
        reminder.eventDatetime,
        pushSetting.pushId,
        pushSetting.minutesBefore,
      );
    }

   for (const voiceSetting of reminder.voiceCallSettings) {
  this.logger.log(
    `Voice setting bulundu. Call ID: ${voiceSetting.callId}, enabled: ${voiceSetting.enabled}`,
  );

  if (!voiceSetting.enabled) {
    continue;
  }

  await this.scheduleVoiceCallJob(
    reminder.reminderId,
    reminder.userId,
    reminder.eventDatetime,
    voiceSetting.callId,
    voiceSetting.minutesBefore,
  );
}
  }

  async rescheduleReminder(reminderId: string) {
    await this.cancelReminderJobs(reminderId);
    await this.scheduleReminder(reminderId);
  }

  async cancelReminderJobs(reminderId: string) {
    const reminder = await this.prisma.reminder.findUnique({
      where: {
        reminderId,
      },
      include: {
        pushNotifications: true,
        voiceCallSettings: true,
      },
    });

    if (!reminder) {
      return;
    }

    for (const pushSetting of reminder.pushNotifications) {
      if (!pushSetting.jobId) {
        continue;
      }

      const job = await this.pushQueue.getJob(pushSetting.jobId);

      if (job) {
        await job.remove();
      }
    }

    for (const voiceSetting of reminder.voiceCallSettings) {
      if (!voiceSetting.jobId) {
        continue;
      }

      const job = await this.voiceCallQueue.getJob(
        voiceSetting.jobId,
      );

      if (job) {
        await job.remove();
      }
    }
  }

  private async schedulePushJob(
    reminderId: string,
    userId: string,
    eventDatetime: Date,
    pushId: string,
    minutesBefore: number,
  ) {
    const delay = this.calculateDelay(
      eventDatetime,
      minutesBefore,
    );

    if (delay <= 0) {
      this.logger.warn(
        `Push job geçmiş zamana denk geliyor. Push ID: ${pushId}`,
      );

      return;
    }

    const jobId = `push-${pushId}`;

    const job = await this.pushQueue.add(
      JOB_NAMES.SEND_PUSH_NOTIFICATION,
      {
        reminderId,
        userId,
        settingId: pushId,
      },
      {
        jobId,
        delay,
      },
    );

    await this.prisma.pushNotificationSetting.update({
      where: {
        pushId,
      },
      data: {
        jobId: String(job.id),
      },
    });

    this.logger.log(
      `Push job oluşturuldu. Job ID: ${job.id}`,
    );
  }

  private async scheduleVoiceCallJob(
    reminderId: string,
    userId: string,
    eventDatetime: Date,
    callId: string,
    minutesBefore: number,
  ) {
    
    const delay = this.calculateDelay(
      eventDatetime,
      minutesBefore,
    );
    this.logger.log(
    `Voice job planlanıyor. Event: ${eventDatetime.toISOString()}, minutesBefore: ${minutesBefore}`,
  );

    if (delay <= 0) {
      this.logger.warn(
        `Voice call job geçmiş zamana denk geliyor. Call ID: ${callId}`,
      );

      return;
    }

    const jobId = `voice-${callId}`;

    const job = await this.voiceCallQueue.add(
      JOB_NAMES.MAKE_VOICE_CALL,
      {
        reminderId,
        userId,
        settingId: callId,
      },
      {
        jobId,
        delay,
      },
    );

    await this.prisma.voiceCallSetting.update({
      where: {
        callId,
      },
      data: {
        jobId: String(job.id),
      },
    });

    this.logger.log(
      `Voice call job oluşturuldu. Job ID: ${job.id}`,
    );
  }

  private calculateDelay(
    eventDatetime: Date,
    minutesBefore: number,
  ): number {
    const executionTime =
      eventDatetime.getTime() -
      minutesBefore * 60 * 1000;

    return executionTime - Date.now();
  }
}