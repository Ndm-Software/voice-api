import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

import { JOB_NAMES, QUEUE_NAMES } from '../constants/queue.constants';

import { ReminderJobData } from '../interfaces/reminder-job-data.interface';
import { SchedulerService } from '../scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { VoiceCallService } from '../../modules/voice-call/voice-call.service';

@Processor(QUEUE_NAMES.VOICE_CALL)
export class VoiceCallProcessor {
  private readonly logger = new Logger(VoiceCallProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
        private readonly schedulerService: SchedulerService,
    private readonly voiceCallService: VoiceCallService,
  ) {}

  @Process(JOB_NAMES.MAKE_VOICE_CALL)
  async handleVoiceCall(job: Job<ReminderJobData>): Promise<void> {
    this.logger.log(`Voice call job başladı. Job ID: ${job.id}`);

    const reminder = await this.prisma.reminder.findUnique({
      where: {
        reminderId: job.data.reminderId,
      },
      include: {
        user: true,
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

    const rawPhoneNumber = reminder.user.phoneNumber;

    const phoneNumber = rawPhoneNumber.startsWith('+')
      ? rawPhoneNumber
      : `+90${rawPhoneNumber.replace(/^0/, '')}`;

    const message = reminder.description
      ? `${reminder.title}. ${reminder.description}`
      : reminder.title;

    this.logger.log(`Twilio hedef numara: ${phoneNumber}`);

    this.logger.log(`Okunacak mesaj: ${message}`);

    const result = await this.voiceCallService.makeCall(phoneNumber, message);

    if (result.success) {
      this.logger.log(`Voice call tamamlandi. Call SID: ${result.callSid}`);
    } else {
      this.logger.error(`Voice call başarisiz. Hata: ${result.error}`);
    }
     await this.schedulerService.handleRecurringReminder(job.data.reminderId);
  }
}
