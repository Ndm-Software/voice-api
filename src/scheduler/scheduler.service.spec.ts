import { Queue } from 'bull';

import { PrismaService } from '../prisma/prisma.service';
import { JOB_NAMES } from './constants/queue.constants';
import { SchedulerService } from './scheduler.service';

describe('SchedulerService voice call scheduling', () => {
  const reminderFindUnique = jest.fn();
  const voiceSettingUpdate = jest.fn();
  const pushQueue = {
    add: jest.fn(),
    getJob: jest.fn(),
  };
  const voiceCallQueue = {
    add: jest.fn(),
    getJob: jest.fn(),
  };
  const service = new SchedulerService(
    {
      reminder: {
        findUnique: reminderFindUnique,
      },
      pushNotificationSetting: {
        update: jest.fn(),
      },
      voiceCallSetting: {
        update: voiceSettingUpdate,
      },
    } as unknown as PrismaService,
    pushQueue as unknown as Queue,
    voiceCallQueue as unknown as Queue,
  );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-21T08:00:00.000Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates one delayed voice job with a schedule-specific identity', async () => {
    const eventDatetime = new Date('2026-08-21T09:00:00.000Z');
    const executionTime = new Date('2026-08-21T08:45:00.000Z').getTime();
    const jobId = `voice-setting-id-${executionTime}`;
    reminderFindUnique.mockResolvedValueOnce({
      reminderId: 'reminder-id',
      userId: 'user-id',
      status: 'ACTIVE',
      eventDatetime,
      pushNotifications: [],
      voiceCallSettings: [
        {
          callId: 'setting-id',
          enabled: true,
          minutesBefore: 15,
        },
      ],
    });
    voiceCallQueue.add.mockResolvedValueOnce({ id: jobId });

    await service.scheduleReminder('reminder-id');

    expect(voiceCallQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.MAKE_VOICE_CALL,
      {
        reminderId: 'reminder-id',
        userId: 'user-id',
        settingId: 'setting-id',
      },
      {
        jobId,
        delay: 45 * 60 * 1000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    expect(voiceSettingUpdate).toHaveBeenCalledWith({
      where: {
        callId: 'setting-id',
      },
      data: {
        jobId,
      },
    });
  });

  it('does not create a voice job whose execution time is in the past', async () => {
    reminderFindUnique.mockResolvedValueOnce({
      reminderId: 'reminder-id',
      userId: 'user-id',
      status: 'ACTIVE',
      eventDatetime: new Date('2026-08-21T08:10:00.000Z'),
      pushNotifications: [],
      voiceCallSettings: [
        {
          callId: 'setting-id',
          enabled: true,
          minutesBefore: 15,
        },
      ],
    });

    await service.scheduleReminder('reminder-id');

    expect(voiceCallQueue.add).not.toHaveBeenCalled();
    expect(voiceSettingUpdate).not.toHaveBeenCalled();
  });

  it('finds an attempted voice job by its underlying Bull identity', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    reminderFindUnique.mockResolvedValueOnce({
      pushNotifications: [],
      voiceCallSettings: [
        {
          callId: 'setting-id',
          jobId: 'attempting:voice-setting-id-1787301900000',
        },
      ],
    });
    voiceCallQueue.getJob.mockResolvedValueOnce({ remove });

    await service.cancelReminderJobs('reminder-id');

    expect(voiceCallQueue.getJob).toHaveBeenCalledWith(
      'voice-setting-id-1787301900000',
    );
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
