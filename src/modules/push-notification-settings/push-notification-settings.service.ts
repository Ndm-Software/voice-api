import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerService } from '../../scheduler/scheduler.service';

import { CreatePushNotificationSettingDto } from './dto/create-push-notification-setting.dto';
import { UpdatePushNotificationSettingDto } from './dto/update-push-notification-setting.dto';

@Injectable()
export class PushNotificationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerService: SchedulerService,
  ) {}

  async create(userId: string, dto: CreatePushNotificationSettingDto) {
    const reminder = await this.prisma.reminder.findFirst({
      where: {
        reminderId: dto.reminderId,
        userId,
      },
    });

    if (!reminder) {
      throw new NotFoundException('Hatırlatıcı bulunamadı.');
    }

    const setting = await this.prisma.pushNotificationSetting.create({
      data: {
        reminderId: dto.reminderId,
        minutesBefore: dto.minutesBefore,
        jobId: '',
        enabled: true,
      },
    });

    await this.schedulerService.rescheduleReminder(dto.reminderId);

    return setting;
  }

  async findAll(userId: string) {
    return this.prisma.pushNotificationSetting.findMany({
      where: {
        reminder: {
          userId,
        },
      },
      include: {
        reminder: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(userId: string, pushId: string) {
    const setting = await this.prisma.pushNotificationSetting.findFirst({
      where: {
        pushId,
        reminder: {
          userId,
        },
      },
      include: {
        reminder: true,
      },
    });

    if (!setting) {
      throw new NotFoundException('Push notification ayarı bulunamadı.');
    }

    return setting;
  }

  async update(
    userId: string,
    pushId: string,
    dto: UpdatePushNotificationSettingDto,
  ) {
    const setting = await this.findOne(userId, pushId);

    const updatedSetting = await this.prisma.pushNotificationSetting.update({
      where: {
        pushId,
      },
      data: {
        ...(dto.minutesBefore !== undefined && {
          minutesBefore: dto.minutesBefore,
        }),
        ...(dto.enabled !== undefined && {
          enabled: dto.enabled,
        }),
      },
    });

    await this.schedulerService.rescheduleReminder(setting.reminderId);

    return updatedSetting;
  }

  async remove(userId: string, pushId: string) {
    const setting = await this.findOne(userId, pushId);

    await this.prisma.pushNotificationSetting.delete({
      where: {
        pushId,
      },
    });

    await this.schedulerService.rescheduleReminder(setting.reminderId);

    return {
      message: 'Push notification ayarı başarıyla silindi.',
    };
  }
}
