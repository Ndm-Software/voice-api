import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { LanguagesService } from '../languages/languages.service';
import { SchedulerService } from '../../scheduler/scheduler.service';
import { UserSettingsService } from './user-settings.service';

describe('UserSettingsService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const languageId = '22222222-2222-4222-8222-222222222222';

  let prisma: {
    userSetting: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
    reminder: {
      findMany: jest.Mock;
    };
  };

  let languagesService: {
    findById: jest.Mock;
  };

  let schedulerService: {
    rescheduleReminder: jest.Mock;
  };

  let service: UserSettingsService;

  beforeEach(() => {
    prisma = {
      userSetting: {
        findUnique: jest.fn().mockResolvedValue({
          settingId: 'setting-id',
        }),
        upsert: jest.fn().mockResolvedValue({
          userId,
        }),
        update: jest.fn().mockResolvedValue({
          userId,
        }),
      },
      reminder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    languagesService = {
      findById: jest.fn().mockResolvedValue({
        languageId,
      }),
    };

    schedulerService = {
      rescheduleReminder: jest.fn(),
    };

    service = new UserSettingsService(
      prisma as unknown as PrismaService,
      languagesService as unknown as LanguagesService,
      schedulerService as unknown as SchedulerService,
    );
  });

  it('saves normalized settings and disables emergency override', async () => {
    await service.save(userId, {
      languageId,
      timezone: ' Europe/Istanbul ',
      province: ' Istanbul ',
      notificationsEnabled: true,
      defaultPushBefore: 10,
      defaultCallBefore: 20,
    });

    expect(languagesService.findById).toHaveBeenCalledWith(languageId);

    expect(prisma.userSetting.upsert).toHaveBeenCalledWith({
      where: { userId },
      create: {
        userId,
        languageId,
        timezone: 'Europe/Istanbul',
        province: 'Istanbul',
        notificationsEnabled: true,
        defaultPushBefore: 10,
        defaultCallBefore: 20,
        emergencyOverride: false,
      },
      update: {
        languageId,
        timezone: 'Europe/Istanbul',
        province: 'Istanbul',
        notificationsEnabled: true,
        defaultPushBefore: 10,
        defaultCallBefore: 20,
        emergencyOverride: false,
      },
      select: {
        settingId: true,
        userId: true,
        languageId: true,
        timezone: true,
        province: true,
        notificationsEnabled: true,
        defaultPushBefore: true,
        defaultCallBefore: true,
        emergencyOverride: true,
        createdAt: true,
        updatedAt: true,
        language: {
          select: {
            languageId: true,
            code: true,
            name: true,
            voiceName: true,
          },
        },
      },
    });

    expect(prisma.reminder.findMany).toHaveBeenCalledWith({
      where: {
        userId,
        status: 'ACTIVE',
      },
      select: {
        reminderId: true,
      },
    });
  });

  it('rejects invalid timezones before writing settings', async () => {
    await expect(
      service.save(userId, {
        languageId,
        timezone: 'Not/A_Timezone',
        province: 'Istanbul',
        notificationsEnabled: true,
        defaultPushBefore: 10,
        defaultCallBefore: 20,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.userSetting.upsert).not.toHaveBeenCalled();
    expect(prisma.reminder.findMany).not.toHaveBeenCalled();
  });

  it('updates only supplied settings after verifying the record exists', async () => {
    await service.update(userId, {
      timezone: ' Europe/Istanbul ',
      province: ' Ankara ',
    });

    expect(prisma.userSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        data: {
          timezone: 'Europe/Istanbul',
          province: 'Ankara',
        },
      }),
    );

    expect(prisma.reminder.findMany).toHaveBeenCalledWith({
      where: {
        userId,
        status: 'ACTIVE',
      },
      select: {
        reminderId: true,
      },
    });

    prisma.userSetting.findUnique.mockResolvedValue(null);

    await expect(service.update(userId, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.userSetting.update).toHaveBeenCalledTimes(1);
  });
});
