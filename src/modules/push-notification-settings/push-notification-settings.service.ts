import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { CreatePushNotificationSettingDto } from './dto/create-push-notification-setting.dto';
import { UpdatePushNotificationSettingDto } from './dto/update-push-notification-setting.dto';

@Injectable()
export class PushNotificationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.pushNotificationSetting.create({
      data: {
        reminderId: dto.reminderId,
        minutesBefore: dto.minutesBefore,
        jobId: '',
        enabled: true,
      },
    });
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
    await this.findOne(userId, pushId);

    return this.prisma.pushNotificationSetting.update({
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
  }

  async remove(userId: string, pushId: string) {
    await this.findOne(userId, pushId);

    await this.prisma.pushNotificationSetting.delete({
      where: {
        pushId,
      },
    });

    return {
      message: 'Push notification ayarı başarıyla silindi.',
    };
  }
}
