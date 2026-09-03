import { Job } from 'bull';

import {
  InvalidPollyTextError,
  PollySynthesisError,
} from '../../integrations/polly/polly.errors';
import type { SynthesizedSpeech } from '../../integrations/polly/polly.types';
import type { PollyService } from '../../integrations/polly/polly.service';
import type { PushNotificationService } from '../../modules/push-notification/push-notification.service';
import type { ReminderHistoryService } from '../../modules/reminder-history/reminder-history.service';
import type { VoiceCallService } from '../../modules/voice-call/voice-call.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { ReminderJobData } from '../interfaces/reminder-job-data.interface';
import type { SchedulerService } from '../scheduler.service';
import { VoiceCallProcessor } from './voice-call.processor';

describe('VoiceCallProcessor', () => {
  const reminderFindUnique = jest.fn();
  const voiceSettingUpdateMany = jest.fn();
  const pollyService = {
    synthesize: jest.fn(),
  };
  const voiceCallService = {
    makeCall: jest.fn(),
  };
  const schedulerService = {
    handleRecurringReminder: jest.fn(),
  };
  const pushNotificationService = {
    sendToDevice: jest.fn(),
  };
  const reminderHistoryService = {
    create: jest.fn(),
  };
  const jobDiscard = jest.fn();
  const processor = new VoiceCallProcessor(
    {
      reminder: {
        findUnique: reminderFindUnique,
      },
      voiceCallSetting: {
        updateMany: voiceSettingUpdateMany,
      },
    } as unknown as PrismaService,
    pollyService as unknown as PollyService,
    voiceCallService as unknown as VoiceCallService,
    schedulerService as unknown as SchedulerService,
    pushNotificationService as unknown as PushNotificationService,
    reminderHistoryService as unknown as ReminderHistoryService,
  );

  const job = {
    id: 'voice-call-job',
    attemptsMade: 0,
    discard: jobDiscard,
    data: {
      reminderId: 'reminder-id',
      userId: 'user-id',
      settingId: 'setting-id',
      scheduledFor: '2026-08-21T09:00:00.000Z',
    },
  } as Job<ReminderJobData>;

  const speech: SynthesizedSpeech = {
    audio: Buffer.from('polly-audio'),
    contentType: 'audio/mpeg',
    format: 'mp3',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    job.attemptsMade = 0;
    reminderFindUnique.mockResolvedValue(createReminder());
    voiceSettingUpdateMany.mockResolvedValue({ count: 1 });
    pollyService.synthesize.mockResolvedValue(speech);
    voiceCallService.makeCall.mockResolvedValue({
      callSid: `CA${'1'.repeat(32)}`,
      status: 'queued',
    });
    schedulerService.handleRecurringReminder.mockResolvedValue(undefined);
  });

  it('synthesizes in the user language and starts one Twilio call', async () => {
    await processor.handleVoiceCall(job);

    expect(reminderFindUnique).toHaveBeenCalledWith({
      where: {
        reminderId: 'reminder-id',
      },
      include: {
        user: {
          include: {
            userSetting: {
              include: {
                language: true,
              },
            },
            devices: true,
          },
        },
        voiceCallSettings: true,
      },
    });
    expect(voiceSettingUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        callId: 'setting-id',
        enabled: true,
        jobId: 'voice-call-job',
      },
      data: {
        jobId: 'processing:voice-call-job',
      },
    });
    expect(voiceSettingUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        callId: 'setting-id',
        enabled: true,
        jobId: 'processing:voice-call-job',
      },
      data: {
        jobId: 'attempting:voice-call-job',
      },
    });
    expect(voiceSettingUpdateMany).toHaveBeenNthCalledWith(3, {
      where: {
        callId: 'setting-id',
        jobId: 'attempting:voice-call-job',
      },
      data: {
        jobId: null,
      },
    });
    expect(pollyService.synthesize).toHaveBeenCalledWith({
      text: 'İlaç zamanı. Bir bardak suyla al',
      languageCode: 'TR',
    });
    expect(voiceCallService.makeCall).toHaveBeenCalledWith(
      '+905551112233',
      speech,
    );
    expect(jobDiscard).not.toHaveBeenCalled();
    expect(reminderHistoryService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderId: 'reminder-id',
        historyType: 'VOICE_CALL',
        status: 'SUCCESS',
        provider: 'TWILIO',
      }),
    );
    expect(schedulerService.handleRecurringReminder).toHaveBeenCalledWith(
      'reminder-id',
      '2026-08-21T09:00:00.000Z',
      'setting-id',
    );
  });

  it('ignores a stale or already replaced Bull job', async () => {
    reminderFindUnique.mockResolvedValueOnce(
      createReminder({ jobId: 'newer-job' }),
    );

    await processor.handleVoiceCall(job);

    expect(voiceSettingUpdateMany).not.toHaveBeenCalled();
    expect(pollyService.synthesize).not.toHaveBeenCalled();
    expect(voiceCallService.makeCall).not.toHaveBeenCalled();
  });

  it('prevents a concurrent worker from starting a duplicate call', async () => {
    voiceSettingUpdateMany.mockResolvedValueOnce({ count: 0 });

    await processor.handleVoiceCall(job);

    expect(pollyService.synthesize).not.toHaveBeenCalled();
    expect(voiceCallService.makeCall).not.toHaveBeenCalled();
  });

  it('keeps the processing claim for retry after a transient Polly failure', async () => {
    const error = new PollySynthesisError();
    pollyService.synthesize.mockRejectedValueOnce(error);

    await expect(processor.handleVoiceCall(job)).rejects.toBe(error);
    expect(voiceSettingUpdateMany).toHaveBeenCalledTimes(1);
    expect(jobDiscard).not.toHaveBeenCalled();
    expect(voiceCallService.makeCall).not.toHaveBeenCalled();
  });

  it('keeps a successful stalled worker eligible when another worker fails Polly', async () => {
    const firstSpeech = createDeferred<SynthesizedSpeech>();
    const secondSpeech = createDeferred<SynthesizedSpeech>();
    const error = new PollySynthesisError();
    let storedJobId: string | null = 'processing:voice-call-job';

    reminderFindUnique.mockResolvedValue(
      createReminder({ jobId: 'processing:voice-call-job' }),
    );
    voiceSettingUpdateMany.mockImplementation(
      ({ where, data }: VoiceSettingStateUpdate) => {
        if (where.jobId !== storedJobId) {
          return Promise.resolve({ count: 0 });
        }

        storedJobId = data.jobId;
        return Promise.resolve({ count: 1 });
      },
    );
    pollyService.synthesize
      .mockReturnValueOnce(firstSpeech.promise)
      .mockReturnValueOnce(secondSpeech.promise);

    const firstRun = processor.handleVoiceCall(job);
    await waitForAsyncWork();
    const secondRun = processor.handleVoiceCall(job);
    await waitForAsyncWork();

    const firstResult = expect(firstRun).rejects.toBe(error);
    firstSpeech.reject(error);
    await firstResult;
    secondSpeech.resolve(speech);
    await secondRun;

    expect(storedJobId).toBeNull();
    expect(voiceCallService.makeCall).toHaveBeenCalledTimes(1);
    expect(jobDiscard).not.toHaveBeenCalled();
  });

  it('discards retries for a permanent Polly input failure', async () => {
    const error = new InvalidPollyTextError();
    pollyService.synthesize.mockRejectedValueOnce(error);

    await expect(processor.handleVoiceCall(job)).rejects.toBe(error);
    expect(jobDiscard).toHaveBeenCalledTimes(1);
    expect(voiceCallService.makeCall).not.toHaveBeenCalled();
  });

  it('retries after a Twilio call failure', async () => {
    const error = new Error('safe Twilio error');

    voiceCallService.makeCall.mockRejectedValueOnce(error);

    await expect(processor.handleVoiceCall(job)).rejects.toBe(error);

    expect(voiceCallService.makeCall).toHaveBeenCalledTimes(1);

    expect(reminderHistoryService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderId: 'reminder-id',
        historyType: 'VOICE_CALL',
        status: 'FAILED',
        provider: 'TWILIO',
        attempt: 1,
      }),
    );

    expect(voiceSettingUpdateMany).toHaveBeenLastCalledWith({
      where: {
        callId: 'setting-id',
        enabled: true,
        jobId: 'attempting:voice-call-job',
      },
      data: {
        jobId: 'voice-call-job',
      },
    });

    expect(jobDiscard).not.toHaveBeenCalled();
  });

  it('does not repeat a call whose Twilio attempt had already started', async () => {
    reminderFindUnique.mockResolvedValueOnce(
      createReminder({ jobId: 'attempting:voice-call-job' }),
    );

    await expect(processor.handleVoiceCall(job)).rejects.toThrow(
      'Voice call attempt has already started',
    );
    expect(jobDiscard).toHaveBeenCalledTimes(1);
    expect(pollyService.synthesize).not.toHaveBeenCalled();
    expect(voiceCallService.makeCall).not.toHaveBeenCalled();
  });

  it('recovers a stalled processing claim without relying on attemptsMade', async () => {
    reminderFindUnique.mockResolvedValueOnce(
      createReminder({ jobId: 'processing:voice-call-job' }),
    );

    await processor.handleVoiceCall(job);

    expect(voiceSettingUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        callId: 'setting-id',
        enabled: true,
        jobId: 'processing:voice-call-job',
      },
      data: {
        jobId: 'processing:voice-call-job',
      },
    });
    expect(voiceCallService.makeCall).toHaveBeenCalledTimes(1);
  });

  it('uses the current reminder occurrence for a legacy queued job', async () => {
    const legacyJob = {
      ...job,
      data: {
        reminderId: 'reminder-id',
        userId: 'user-id',
        settingId: 'setting-id',
      },
    } as Job<ReminderJobData>;

    await processor.handleVoiceCall(legacyJob);

    expect(schedulerService.handleRecurringReminder).toHaveBeenCalledWith(
      'reminder-id',
      '2026-08-21T09:00:00.000Z',
      'setting-id',
    );
  });

  it('retries recurrence bookkeeping without starting a second call', async () => {
    const retryJob = {
      ...job,
      attemptsMade: 1,
    } as Job<ReminderJobData>;
    reminderFindUnique.mockResolvedValueOnce(
      createReminder({ jobId: 'attempting:voice-call-job' }),
    );

    await processor.handleVoiceCall(retryJob);

    expect(schedulerService.handleRecurringReminder).toHaveBeenCalledTimes(1);
    expect(pollyService.synthesize).not.toHaveBeenCalled();
    expect(voiceCallService.makeCall).not.toHaveBeenCalled();
    expect(voiceSettingUpdateMany).toHaveBeenCalledWith({
      where: {
        callId: 'setting-id',
        jobId: 'attempting:voice-call-job',
      },
      data: { jobId: null },
    });
  });

  it('recovers a failed recurrence schedule without repeating a successful call', async () => {
    const error = new Error('Redis unavailable');
    schedulerService.handleRecurringReminder.mockRejectedValueOnce(error);

    await expect(processor.handleVoiceCall(job)).rejects.toBe(error);
    expect(voiceCallService.makeCall).toHaveBeenCalledTimes(1);
    expect(jobDiscard).not.toHaveBeenCalled();
    expect(voiceSettingUpdateMany).not.toHaveBeenCalledWith({
      where: {
        callId: 'setting-id',
        jobId: 'attempting:voice-call-job',
      },
      data: { jobId: null },
    });

    const retryJob = {
      ...job,
      attemptsMade: 1,
    } as Job<ReminderJobData>;
    reminderFindUnique.mockResolvedValueOnce(
      createReminder({ jobId: 'attempting:voice-call-job' }),
    );

    await processor.handleVoiceCall(retryJob);

    expect(voiceCallService.makeCall).toHaveBeenCalledTimes(1);
    expect(schedulerService.handleRecurringReminder).toHaveBeenCalledTimes(2);
  });
});

const createReminder = (
  voiceSetting: { jobId: string } = {
    jobId: 'voice-call-job',
  },
) => ({
  reminderId: 'reminder-id',
  status: 'ACTIVE',
  eventDatetime: new Date('2026-08-21T09:00:00.000Z'),
  title: 'İlaç zamanı',
  description: 'Bir bardak suyla al',
  user: {
    phoneNumber: '+905551112233',
    devices: [],
    userSetting: {
      language: {
        code: 'TR',
      },
    },
  },
  voiceCallSettings: [
    {
      callId: 'setting-id',
      enabled: true,
      jobId: voiceSetting.jobId,
    },
  ],
});

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

const waitForAsyncWork = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

interface VoiceSettingStateUpdate {
  readonly where: {
    readonly jobId: string | null;
  };
  readonly data: {
    readonly jobId: string | null;
  };
}
