import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

import {
  JOB_NAMES,
  QUEUE_NAMES,
} from '../constants/queue.constants';

import { ReminderJobData } from '../interfaces/reminder-job-data.interface';

@Processor(QUEUE_NAMES.PUSH_NOTIFICATION)
export class PushNotificationProcessor {
  private readonly logger =
    new Logger(PushNotificationProcessor.name);

  @Process(JOB_NAMES.SEND_PUSH_NOTIFICATION)
  async handlePushNotification(
    job: Job<ReminderJobData>,
  ): Promise<void> {
    this.logger.log(
      `Push job çalıştı. Job ID: ${job.id}, Reminder ID: ${job.data.reminderId}`,
    );
  }
}