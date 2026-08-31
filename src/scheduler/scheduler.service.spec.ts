import { Queue } from 'bull';

import { DayOfWeek } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_NAMES } from './constants/queue.constants';
import { SchedulerService } from './scheduler.service';

describe('SchedulerService voice call scheduling', () => {
  const reminderFindUnique = jest.fn();
  const reminderUpdateMany = jest.fn();
  const pushSettingUpdateMany = jest.fn();
  const voiceSettingUpdateMany = jest.fn();
  const userSettingFindUnique = jest.fn();
  const silentHourFindMany = jest.fn();
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
        updateMany: reminderUpdateMany,
      },
      pushNotificationSetting: {
        updateMany: pushSettingUpdateMany,
      },
      voiceCallSetting: {
        updateMany: voiceSettingUpdateMany,
      },
      userSetting: {
        findUnique: userSettingFindUnique,
      },
      silentHour: {
        findMany: silentHourFindMany,
      },
    } as unknown as PrismaService,
    pushQueue as unknown as Queue,
    voiceCallQueue as unknown as Queue,
  );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-21T08:00:00.000Z'));
    jest.clearAllMocks();
    userSettingFindUnique.mockResolvedValue({ timezone: 'UTC' });
    silentHourFindMany.mockResolvedValue([]);
    reminderUpdateMany.mockResolvedValue({ count: 1 });
    pushSettingUpdateMany.mockResolvedValue({ count: 1 });
    voiceSettingUpdateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
      isUrgent: false,
      eventDatetime,
      pushNotifications: [],
      voiceCallSettings: [
        {
          callId: 'setting-id',
          enabled: true,
          jobId: null,
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
        scheduledFor: eventDatetime.toISOString(),
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
    expect(voiceSettingUpdateMany).toHaveBeenCalledWith({
      where: {
        callId: 'setting-id',
        enabled: true,
        jobId: null,
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
      isUrgent: false,
      eventDatetime: new Date('2026-08-21T08:10:00.000Z'),
      pushNotifications: [],
      voiceCallSettings: [
        {
          callId: 'setting-id',
          enabled: true,
          jobId: null,
          minutesBefore: 15,
        },
      ],
    });

    await service.scheduleReminder('reminder-id');

    expect(voiceCallQueue.add).not.toHaveBeenCalled();
    expect(voiceSettingUpdateMany).not.toHaveBeenCalled();
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

  it('defers an overnight silent-hour job until the interval ends', async () => {
    jest.setSystemTime(new Date('2026-08-21T00:00:00.000Z'));
    const eventDatetime = new Date('2026-08-21T03:15:00.000Z');
    const adjustedExecutionTime = new Date(
      '2026-08-21T07:00:00.000Z',
    ).getTime();
    const jobId = `voice-setting-id-${adjustedExecutionTime}`;
    reminderFindUnique.mockResolvedValueOnce({
      reminderId: 'reminder-id',
      userId: 'user-id',
      status: 'ACTIVE',
      isUrgent: false,
      eventDatetime,
      pushNotifications: [],
      voiceCallSettings: [
        {
          callId: 'setting-id',
          enabled: true,
          jobId: null,
          minutesBefore: 15,
        },
      ],
    });
    silentHourFindMany.mockResolvedValueOnce([
      {
        dayOfWeek: DayOfWeek.THURSDAY,
        silentStart: new Date('1970-01-01T22:00:00.000Z'),
        silentEnd: new Date('1970-01-01T07:00:00.000Z'),
      },
    ]);
    voiceCallQueue.add.mockResolvedValueOnce({ id: jobId });

    await service.scheduleReminder('reminder-id');

    expect(voiceCallQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.MAKE_VOICE_CALL,
      expect.objectContaining({
        scheduledFor: eventDatetime.toISOString(),
      }),
      expect.objectContaining({
        jobId,
        delay: 7 * 60 * 60 * 1000,
      }),
    );
  });

  it('advances one recurring occurrence only once when jobs finish together', async () => {
    const eventDatetime = new Date('2026-08-21T09:00:00.000Z');
    reminderFindUnique.mockResolvedValue({
      reminderId: 'reminder-id',
      status: 'ACTIVE',
      repeatType: 'DAILY',
      repeatUntil: null,
      eventDatetime,
      user: {
        userSetting: { timezone: 'UTC' },
      },
      pushNotifications: [
        {
          pushId: 'push-setting-id',
          enabled: true,
          minutesBefore: 5,
        },
      ],
      voiceCallSettings: [
        {
          callId: 'voice-setting-id',
          enabled: true,
          minutesBefore: 5,
        },
      ],
    });
    reminderUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const scheduleSpy = jest
      .spyOn(service, 'scheduleReminder')
      .mockResolvedValue(undefined);

    await service.handleRecurringReminder(
      'reminder-id',
      eventDatetime.toISOString(),
      'push-setting-id',
    );
    await service.handleRecurringReminder(
      'reminder-id',
      eventDatetime.toISOString(),
      'voice-setting-id',
    );

    expect(reminderUpdateMany).toHaveBeenCalledTimes(2);
    expect(reminderUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        reminderId: 'reminder-id',
        status: 'ACTIVE',
        eventDatetime,
      },
      data: {
        eventDatetime: new Date('2026-08-22T09:00:00.000Z'),
      },
    });
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });

  it('waits for the latest enabled channel before advancing a recurrence', async () => {
    const eventDatetime = new Date('2026-08-21T09:00:00.000Z');
    reminderFindUnique.mockResolvedValueOnce({
      reminderId: 'reminder-id',
      status: 'ACTIVE',
      repeatType: 'DAILY',
      repeatUntil: null,
      eventDatetime,
      user: {
        userSetting: { timezone: 'UTC' },
      },
      pushNotifications: [
        {
          pushId: 'early-setting-id',
          enabled: true,
          minutesBefore: 15,
        },
      ],
      voiceCallSettings: [
        {
          callId: 'latest-setting-id',
          enabled: true,
          minutesBefore: 5,
        },
      ],
    });

    await service.handleRecurringReminder(
      'reminder-id',
      eventDatetime.toISOString(),
      'early-setting-id',
    );

    expect(reminderUpdateMany).not.toHaveBeenCalled();
  });

  it('extends overlapping silent-hour intervals to the latest end', async () => {
    jest.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
    const eventDatetime = new Date('2026-08-25T08:30:00.000Z');
    const adjustedExecutionTime = new Date(
      '2026-08-25T11:00:00.000Z',
    ).getTime();
    const jobId = `voice-setting-id-${adjustedExecutionTime}`;
    reminderFindUnique.mockResolvedValueOnce({
      reminderId: 'reminder-id',
      userId: 'user-id',
      status: 'ACTIVE',
      isUrgent: false,
      eventDatetime,
      pushNotifications: [],
      voiceCallSettings: [
        {
          callId: 'setting-id',
          enabled: true,
          jobId: null,
          minutesBefore: 0,
        },
      ],
    });
    silentHourFindMany.mockResolvedValueOnce([
      {
        dayOfWeek: DayOfWeek.TUESDAY,
        silentStart: new Date('1970-01-01T08:00:00.000Z'),
        silentEnd: new Date('1970-01-01T11:00:00.000Z'),
      },
      {
        dayOfWeek: DayOfWeek.MONDAY,
        silentStart: new Date('1970-01-01T22:00:00.000Z'),
        silentEnd: new Date('1970-01-01T10:00:00.000Z'),
      },
    ]);
    voiceCallQueue.add.mockResolvedValueOnce({ id: jobId });

    await service.scheduleReminder('reminder-id');

    expect(voiceCallQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.MAKE_VOICE_CALL,
      expect.any(Object),
      expect.objectContaining({
        jobId,
        delay: 11 * 60 * 60 * 1000,
      }),
    );
  });

  it('extends a silent-hour chain across three consecutive days', async () => {
    jest.setSystemTime(new Date('2026-08-24T00:00:00.000Z'));
    const eventDatetime = new Date('2026-08-24T23:00:00.000Z');
    const adjustedExecutionTime = new Date(
      '2026-08-26T08:00:00.000Z',
    ).getTime();
    const jobId = `voice-setting-id-${adjustedExecutionTime}`;
    reminderFindUnique.mockResolvedValueOnce({
      reminderId: 'reminder-id',
      userId: 'user-id',
      status: 'ACTIVE',
      isUrgent: false,
      eventDatetime,
      pushNotifications: [],
      voiceCallSettings: [
        {
          callId: 'setting-id',
          enabled: true,
          jobId: null,
          minutesBefore: 0,
        },
      ],
    });
    silentHourFindMany.mockResolvedValueOnce([
      {
        dayOfWeek: DayOfWeek.MONDAY,
        silentStart: new Date('1970-01-01T22:00:00.000Z'),
        silentEnd: new Date('1970-01-01T06:00:00.000Z'),
      },
      {
        dayOfWeek: DayOfWeek.TUESDAY,
        silentStart: new Date('1970-01-01T05:00:00.000Z'),
        silentEnd: new Date('1970-01-01T04:00:00.000Z'),
      },
      {
        dayOfWeek: DayOfWeek.WEDNESDAY,
        silentStart: new Date('1970-01-01T03:00:00.000Z'),
        silentEnd: new Date('1970-01-01T08:00:00.000Z'),
      },
    ]);
    voiceCallQueue.add.mockResolvedValueOnce({ id: jobId });

    await service.scheduleReminder('reminder-id');

    expect(voiceCallQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.MAKE_VOICE_CALL,
      expect.any(Object),
      expect.objectContaining({
        jobId,
        delay: 56 * 60 * 60 * 1000,
      }),
    );
  });

  it('rejects a weekly schedule without an execution window', async () => {
    jest.setSystemTime(new Date('2026-08-24T00:00:00.000Z'));
    const eventDatetime = new Date('2026-08-24T08:00:00.000Z');
    reminderFindUnique.mockResolvedValueOnce({
      reminderId: 'reminder-id',
      userId: 'user-id',
      status: 'ACTIVE',
      isUrgent: false,
      eventDatetime,
      pushNotifications: [],
      voiceCallSettings: [
        {
          callId: 'setting-id',
          enabled: true,
          jobId: null,
          minutesBefore: 0,
        },
      ],
    });
    silentHourFindMany.mockResolvedValueOnce(
      [
        DayOfWeek.MONDAY,
        DayOfWeek.TUESDAY,
        DayOfWeek.WEDNESDAY,
        DayOfWeek.THURSDAY,
        DayOfWeek.FRIDAY,
        DayOfWeek.SATURDAY,
        DayOfWeek.SUNDAY,
      ].map((dayOfWeek) => ({
        dayOfWeek,
        silentStart: new Date('1970-01-01T00:00:00.000Z'),
        silentEnd: new Date('1970-01-01T00:00:00.000Z'),
      })),
    );

    await expect(service.scheduleReminder('reminder-id')).rejects.toThrow(
      'No execution window is available outside configured silent hours',
    );
    expect(voiceCallQueue.add).not.toHaveBeenCalled();
  });

  it('rolls back the occurrence date when recurring scheduling fails', async () => {
    const eventDatetime = new Date('2026-08-21T09:00:00.000Z');
    const nextEventDatetime = new Date('2026-08-22T09:00:00.000Z');
    const error = new Error('Redis unavailable');
    reminderFindUnique.mockResolvedValueOnce({
      reminderId: 'reminder-id',
      status: 'ACTIVE',
      repeatType: 'DAILY',
      repeatUntil: null,
      eventDatetime,
      user: {
        userSetting: { timezone: 'UTC' },
      },
      pushNotifications: [
        {
          pushId: 'push-setting-id',
          enabled: true,
          minutesBefore: 5,
        },
      ],
      voiceCallSettings: [],
    });
    reminderUpdateMany.mockResolvedValue({ count: 1 });
    jest.spyOn(service, 'scheduleReminder').mockRejectedValueOnce(error);

    await expect(
      service.handleRecurringReminder(
        'reminder-id',
        eventDatetime.toISOString(),
        'push-setting-id',
      ),
    ).rejects.toBe(error);

    expect(reminderUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        reminderId: 'reminder-id',
        status: 'ACTIVE',
        eventDatetime: nextEventDatetime,
      },
      data: { eventDatetime },
    });
  });

  it('restores scheduled setting identities after a partial queue failure', async () => {
    const eventDatetime = new Date('2026-08-21T09:00:00.000Z');
    const pushJobId = `push-push-setting-id-${eventDatetime.getTime()}`;
    const error = new Error('Voice queue unavailable');
    reminderFindUnique.mockResolvedValueOnce({
      reminderId: 'reminder-id',
      userId: 'user-id',
      status: 'ACTIVE',
      isUrgent: true,
      eventDatetime,
      pushNotifications: [
        {
          pushId: 'push-setting-id',
          enabled: true,
          jobId: '',
          minutesBefore: 0,
        },
      ],
      voiceCallSettings: [
        {
          callId: 'voice-setting-id',
          enabled: true,
          jobId: null,
          minutesBefore: 0,
        },
      ],
    });
    pushQueue.add.mockResolvedValueOnce({ id: pushJobId });
    voiceCallQueue.add.mockRejectedValueOnce(error);

    await expect(service.scheduleReminder('reminder-id')).rejects.toBe(error);

    expect(pushSettingUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        pushId: 'push-setting-id',
        enabled: true,
        jobId: '',
      },
      data: { jobId: pushJobId },
    });
    expect(pushSettingUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        pushId: 'push-setting-id',
        jobId: pushJobId,
      },
      data: { jobId: '' },
    });
  });
});
