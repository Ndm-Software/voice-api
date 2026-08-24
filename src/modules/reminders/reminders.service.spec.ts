import { BadRequestException, NotFoundException } from '@nestjs/common';

import { RepeatType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerService } from '../../scheduler/scheduler.service';
import { TimezoneService } from '../../common/services/timezone.service';
import { RemindersService } from './reminders.service';

describe('RemindersService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const reminderId = '22222222-2222-4222-8222-222222222222';
  const reminder = { reminderId, userId };
  let prisma: {
    userSetting: { findUnique: jest.Mock };
    reminder: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    pushNotificationSetting: { create: jest.Mock };
    voiceCallSetting: { create: jest.Mock };
  };
  let schedulerService: {
    scheduleReminder: jest.Mock;
    rescheduleReminder: jest.Mock;
    cancelReminderJobs: jest.Mock;
  };
  let timezoneService: { toUtc: jest.Mock };
  let service: RemindersService;

  beforeEach(() => {
    prisma = {
      userSetting: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ timezone: 'Europe/Istanbul' }),
      },
      reminder: {
        create: jest.fn().mockResolvedValue(reminder),
        findMany: jest.fn().mockResolvedValue([reminder]),
        findFirst: jest.fn().mockResolvedValue(reminder),
        update: jest.fn().mockResolvedValue(reminder),
        delete: jest.fn().mockResolvedValue(reminder),
      },
      pushNotificationSetting: { create: jest.fn().mockResolvedValue({}) },
      voiceCallSetting: { create: jest.fn().mockResolvedValue({}) },
    };
    schedulerService = {
      scheduleReminder: jest.fn().mockResolvedValue(undefined),
      rescheduleReminder: jest.fn().mockResolvedValue(undefined),
      cancelReminderJobs: jest.fn().mockResolvedValue(undefined),
    };
    timezoneService = {
      toUtc: jest.fn((value: string) => `${value}.000Z`),
    };
    service = new RemindersService(
      prisma as unknown as PrismaService,
      schedulerService as unknown as SchedulerService,
      timezoneService as unknown as TimezoneService,
    );
  });

  it('creates a reminder, optional settings, and schedules it', async () => {
    await service.create(userId, {
      title: '  Take medicine  ',
      description: '  After lunch  ',
      eventDatetime: '2026-08-24T15:00:00',
      repeatType: RepeatType.DAILY,
      repeatUntil: '2026-08-31T15:00:00',
      isUrgent: true,
      pushMinutesBefore: 10,
      voiceMinutesBefore: 20,
    });

    expect(prisma.reminder.create).toHaveBeenCalledWith({
      data: {
        userId,
        title: 'Take medicine',
        description: 'After lunch',
        eventDatetime: new Date('2026-08-24T15:00:00.000Z'),
        repeatType: RepeatType.DAILY,
        repeatUntil: new Date('2026-08-31T15:00:00.000Z'),
        status: 'ACTIVE',
        isUrgent: true,
      },
    });
    expect(prisma.pushNotificationSetting.create).toHaveBeenCalled();
    expect(prisma.voiceCallSetting.create).toHaveBeenCalled();
    expect(schedulerService.scheduleReminder).toHaveBeenCalledWith(reminderId);
  });

  it('builds filtered reminder queries', async () => {
    await service.findAll(userId, {
      search: 'medicine',
      isUrgent: true,
      isCompleted: false,
      startDate: '2026-08-24T00:00:00.000Z',
      endDate: '2026-08-25T00:00:00.000Z',
    });

    const findManyCalls = prisma.reminder.findMany.mock.calls as unknown[][];
    expect(findManyCalls[0][0]).toEqual({
      where: {
        userId,
        isUrgent: true,
        isCompleted: false,
        eventDatetime: {
          gte: new Date('2026-08-24T00:00:00.000Z'),
          lte: new Date('2026-08-25T00:00:00.000Z'),
        },
        OR: [
          { title: { contains: 'medicine', mode: 'insensitive' } },
          { description: { contains: 'medicine', mode: 'insensitive' } },
        ],
      },
      include: {
        pushNotifications: true,
        voiceCallSettings: true,
      },
      orderBy: { eventDatetime: 'asc' },
    });
  });

  it('requires timezone settings and protects missing reminders', async () => {
    prisma.userSetting.findUnique.mockResolvedValue(null);
    await expect(
      service.create(userId, {
        title: 'Reminder',
        eventDatetime: '2026-08-24T15:00:00',
        repeatType: RepeatType.DAILY,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.reminder.findFirst.mockResolvedValue(null);
    await expect(service.findOne(userId, reminderId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates and removes reminders through the scheduler', async () => {
    await service.update(userId, reminderId, {
      title: '  Updated  ',
      eventDatetime: '2026-08-24T16:00:00',
      repeatUntil: undefined,
    });
    const updateCalls = prisma.reminder.update.mock.calls as unknown[][];
    expect(updateCalls[0][0]).toEqual({
      where: { reminderId },
      data: {
        title: 'Updated',
        eventDatetime: '2026-08-24T16:00:00.000Z',
      },
    });
    expect(schedulerService.rescheduleReminder).toHaveBeenCalledWith(
      reminderId,
    );

    await service.remove(userId, reminderId);
    expect(schedulerService.cancelReminderJobs).toHaveBeenCalledWith(
      reminderId,
    );
    expect(prisma.reminder.delete).toHaveBeenCalledWith({
      where: { reminderId },
    });
  });
});
