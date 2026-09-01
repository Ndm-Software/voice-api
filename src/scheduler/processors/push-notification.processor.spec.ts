import { Job } from 'bull';

import type { PushNotificationService } from '../../modules/push-notification/push-notification.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { ReminderJobData } from '../interfaces/reminder-job-data.interface';
import type { SchedulerService } from '../scheduler.service';
import { PushNotificationProcessor } from './push-notification.processor';

describe('PushNotificationProcessor', () => {
  const reminderFindUnique = jest.fn();
  const pushSettingUpdateMany = jest.fn();
  const reminderHistoryCreate = jest.fn<
    Promise<{ historyId: string }>,
    [ReminderHistoryCreateArgs]
  >();
  const schedulerService = {
    handleRecurringReminder: jest.fn(),
  };
  const pushNotificationService = {
    sendToDevice: jest.fn(),
  };
  const jobDiscard = jest.fn();
  const processor = new PushNotificationProcessor(
    {
      reminder: {
        findUnique: reminderFindUnique,
      },
      pushNotificationSetting: {
        updateMany: pushSettingUpdateMany,
      },
      reminderHistory: {
        create: reminderHistoryCreate,
      },
    } as unknown as PrismaService,
    schedulerService as unknown as SchedulerService,
    pushNotificationService as unknown as PushNotificationService,
  );
  const job = {
    id: 'push-job',
    attemptsMade: 0,
    discard: jobDiscard,
    data: {
      reminderId: 'reminder-id',
      userId: 'user-id',
      settingId: 'push-setting-id',
      scheduledFor: '2026-08-21T09:00:00.000Z',
    },
  } as Job<ReminderJobData>;

  beforeEach(() => {
    jest.clearAllMocks();
    reminderFindUnique.mockResolvedValue(createReminder());
    pushSettingUpdateMany.mockResolvedValue({ count: 1 });
    reminderHistoryCreate.mockResolvedValue({ historyId: 'history-id' });
    schedulerService.handleRecurringReminder.mockResolvedValue(undefined);
    pushNotificationService.sendToDevice.mockResolvedValue({
      success: true,
      messageId: 'message-id',
    });
  });

  it('claims the job atomically and sends one notification', async () => {
    await processor.handlePushNotification(job);

    expect(pushSettingUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        pushId: 'push-setting-id',
        enabled: true,
        jobId: 'push-job',
      },
      data: { jobId: 'processing:push-job' },
    });
    expect(pushSettingUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        pushId: 'push-setting-id',
        enabled: true,
        jobId: 'processing:push-job',
      },
      data: { jobId: 'attempting:push-job' },
    });
    expect(pushNotificationService.sendToDevice).toHaveBeenCalledTimes(1);
    const [historyArgs] = reminderHistoryCreate.mock.calls[0];
    expect(historyArgs.data).toMatchObject({
      reminderId: 'reminder-id',
      historyType: 'PUSH',
      status: 'SUCCESS',
      provider: 'FCM',
    });
    expect(schedulerService.handleRecurringReminder).toHaveBeenCalledWith(
      'reminder-id',
      '2026-08-21T09:00:00.000Z',
      'push-setting-id',
    );
  });

  it('ignores stale and concurrently attempted jobs', async () => {
    reminderFindUnique
      .mockResolvedValueOnce(createReminder({ jobId: 'newer-job' }))
      .mockResolvedValueOnce(createReminder({ jobId: 'attempting:push-job' }));

    await processor.handlePushNotification(job);
    await processor.handlePushNotification(job);

    expect(pushSettingUpdateMany).not.toHaveBeenCalled();
    expect(pushNotificationService.sendToDevice).not.toHaveBeenCalled();
    expect(schedulerService.handleRecurringReminder).not.toHaveBeenCalled();
  });

  it('supports a legacy queued job without scheduledFor', async () => {
    const legacyJob = {
      ...job,
      data: {
        reminderId: 'reminder-id',
        userId: 'user-id',
        settingId: 'push-setting-id',
      },
    } as Job<ReminderJobData>;

    await processor.handlePushNotification(legacyJob);

    expect(schedulerService.handleRecurringReminder).toHaveBeenCalledWith(
      'reminder-id',
      '2026-08-21T09:00:00.000Z',
      'push-setting-id',
    );
  });

  it('advances recurrence without sending when notifications are disabled', async () => {
    reminderFindUnique.mockResolvedValueOnce(
      createReminder({ notificationsEnabled: false }),
    );

    await processor.handlePushNotification(job);

    expect(pushNotificationService.sendToDevice).not.toHaveBeenCalled();
    expect(schedulerService.handleRecurringReminder).toHaveBeenCalledTimes(1);
  });

  it('records a safe failure and advances when no active device exists', async () => {
    reminderFindUnique.mockResolvedValueOnce(createReminder({ devices: [] }));

    await processor.handlePushNotification(job);

    const [historyArgs] = reminderHistoryCreate.mock.calls[0];
    expect(historyArgs.data).toMatchObject({
      status: 'FAILED',
      errorMessage: 'Aktif push bildirimi cihazı bulunamadı.',
    });
    expect(schedulerService.handleRecurringReminder).toHaveBeenCalledTimes(1);
  });

  it('does not persist a raw Firebase error in reminder history', async () => {
    pushNotificationService.sendToDevice.mockResolvedValueOnce({
      success: false,
      error: 'projects/internal-project/tokens/private-token',
    });

    await processor.handlePushNotification(job);

    const [historyArgs] = reminderHistoryCreate.mock.calls[0];
    expect(historyArgs.data).toMatchObject({
      status: 'FAILED',
      errorMessage: 'Push bildirimi gönderilemedi.',
    });
    expect(historyArgs.data.errorMessage).not.toContain('private-token');
  });

  it('continues recurrence when history persistence fails', async () => {
    reminderHistoryCreate.mockRejectedValueOnce(new Error('Database error'));

    await processor.handlePushNotification(job);

    expect(schedulerService.handleRecurringReminder).toHaveBeenCalledTimes(1);
  });

  it('retries recurrence bookkeeping without sending a duplicate push', async () => {
    const error = new Error('Redis unavailable');
    schedulerService.handleRecurringReminder.mockRejectedValueOnce(error);

    await expect(processor.handlePushNotification(job)).rejects.toBe(error);
    expect(pushNotificationService.sendToDevice).toHaveBeenCalledTimes(1);
    expect(pushSettingUpdateMany).not.toHaveBeenCalledWith({
      where: {
        pushId: 'push-setting-id',
        jobId: 'attempting:push-job',
      },
      data: { jobId: '' },
    });

    const retryJob = {
      ...job,
      attemptsMade: 1,
    } as Job<ReminderJobData>;
    reminderFindUnique.mockResolvedValueOnce(
      createReminder({ jobId: 'attempting:push-job' }),
    );

    await processor.handlePushNotification(retryJob);

    expect(pushNotificationService.sendToDevice).toHaveBeenCalledTimes(1);
    expect(schedulerService.handleRecurringReminder).toHaveBeenCalledTimes(2);
  });
});

interface ReminderHistoryCreateArgs {
  data: {
    attempt: number;
    errorMessage?: string;
    historyType: string;
    provider: string;
    reminderId: string;
    sentAt?: Date;
    status: string;
  };
}

interface ReminderOverrides {
  devices?: Array<{
    deviceId: string;
    isActive: boolean;
    pushToken: string | null;
  }>;
  jobId?: string;
  notificationsEnabled?: boolean;
}

const createReminder = (overrides: ReminderOverrides = {}) => ({
  reminderId: 'reminder-id',
  userId: 'user-id',
  status: 'ACTIVE',
  title: 'İlaç zamanı',
  description: 'Bir bardak suyla al',
  eventDatetime: new Date('2026-08-21T09:00:00.000Z'),
  pushNotifications: [
    {
      pushId: 'push-setting-id',
      enabled: true,
      jobId: overrides.jobId ?? 'push-job',
    },
  ],
  user: {
    userSetting: {
      notificationsEnabled: overrides.notificationsEnabled ?? true,
    },
    devices: overrides.devices ?? [
      {
        deviceId: 'device-id',
        isActive: true,
        pushToken: 'push-token',
      },
    ],
  },
});
