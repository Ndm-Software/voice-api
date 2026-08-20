import { Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

import {
  JOB_NAMES,
  QUEUE_NAMES,
  VOICE_JOB_STATE_PREFIXES,
} from '../constants/queue.constants';

import { ReminderJobData } from '../interfaces/reminder-job-data.interface';

import { PrismaService } from '../../prisma/prisma.service';
import {
  InvalidPollyTextError,
  UnsupportedPollyLanguageError,
} from '../../integrations/polly/polly.errors';
import { PollyService } from '../../integrations/polly/polly.service';
import type { SynthesizedSpeech } from '../../integrations/polly/polly.types';
import { VoiceCallService } from '../../modules/voice-call/voice-call.service';

@Processor(QUEUE_NAMES.VOICE_CALL)
export class VoiceCallProcessor {
  private readonly logger = new Logger(VoiceCallProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pollyService: PollyService,
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
        user: {
          include: {
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
    const recoveringProcessingJob = voiceSetting.jobId === processingJobId;

    if (voiceSetting.jobId === attemptingJobId) {
      await job.discard();
      throw new Error('Voice call attempt has already started');
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
      data: {
        jobId: processingJobId,
      },
    });

    if (claimedSetting.count !== 1) {
      this.logger.warn(`Voice call job daha önce işlendi. Job ID: ${jobId}`);
      return;
    }

    const languageCode = reminder.user.userSetting?.language.code;

    if (!languageCode) {
      await this.restoreRetryableJob(
        voiceSetting.callId,
        processingJobId,
        jobId,
      );
      await job.discard();
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
        await this.restoreRetryableJob(
          voiceSetting.callId,
          processingJobId,
          jobId,
        );
        await job.discard();
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
      data: {
        jobId: attemptingJobId,
      },
    });

    if (callAttempt.count !== 1) {
      this.logger.warn(`Voice call job sahipliği kaybedildi. Job ID: ${jobId}`);
      return;
    }

    try {
      const result = await this.voiceCallService.makeCall(
        reminder.user.phoneNumber,
        speech,
      );

      await this.prisma.voiceCallSetting.updateMany({
        where: {
          callId: voiceSetting.callId,
          jobId: attemptingJobId,
        },
        data: {
          jobId: null,
        },
      });

      this.logger.log(`Voice call başlatıldı. Call SID: ${result.callSid}`);
    } catch (error: unknown) {
      await job.discard();
      this.logger.error('Voice call job başarısız oldu.');
      throw error;
    }
  }

  private async restoreRetryableJob(
    callId: string,
    processingJobId: string,
    jobId: string,
  ): Promise<void> {
    await this.prisma.voiceCallSetting.updateMany({
      where: {
        callId,
        jobId: processingJobId,
      },
      data: {
        jobId,
      },
    });
  }
}
