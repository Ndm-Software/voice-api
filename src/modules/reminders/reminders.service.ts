import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerService } from '../../scheduler/scheduler.service';
import { TimezoneService } from '../../common/services/timezone.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { FindRemindersDto } from './dto/find-reminders.dto';

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerService: SchedulerService,
    private readonly timezoneService: TimezoneService,
  ) {}

  async create(userId: string, dto: CreateReminderDto) {
    const userSettings = await this.prisma.userSetting.findUnique({
      where: {
        userId,
      },
      select: {
        timezone: true,
      },
    });

    if (!userSettings) {
      throw new BadRequestException(
        'Hatırlatıcı oluşturmak için kullanıcı timezone ayarı gereklidir.',
      );
    }

    const eventDatetime = this.timezoneService.toUtc(
      dto.eventDatetime,
      userSettings.timezone,
    );

    const repeatUntil = dto.repeatUntil
      ? this.timezoneService.toUtc(dto.repeatUntil, userSettings.timezone)
      : undefined;

    const reminder = await this.prisma.reminder.create({
      data: {
        userId,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        eventDatetime: new Date(eventDatetime),
        repeatType: dto.repeatType,
        repeatUntil: repeatUntil ? new Date(repeatUntil) : undefined,
        status: 'ACTIVE',
        isUrgent: dto.isUrgent ?? false,
      },
    });

    if (dto.pushMinutesBefore !== undefined) {
      await this.prisma.pushNotificationSetting.create({
        data: {
          reminderId: reminder.reminderId,
          minutesBefore: dto.pushMinutesBefore,
          jobId: '',
          enabled: true,
        },
      });
    }

    if (dto.voiceMinutesBefore !== undefined) {
      await this.prisma.voiceCallSetting.create({
        data: {
          reminderId: reminder.reminderId,
          minutesBefore: dto.voiceMinutesBefore,
          enabled: true,
        },
      });
    }

    await this.schedulerService.scheduleReminder(reminder.reminderId);

    return this.findOne(userId, reminder.reminderId);
  }

  async findAll(userId: string, filterDto?: FindRemindersDto) {
    const { search, isUrgent, isCompleted, startDate, endDate } =
      filterDto || {};

    return this.prisma.reminder.findMany({
      where: {
        userId,
        ...(isUrgent !== undefined ? { isUrgent } : {}),
        ...(isCompleted !== undefined ? { isCompleted } : {}),
        ...(startDate || endDate
          ? {
              eventDatetime: {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(endDate) } : {}),
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        pushNotifications: true,
        voiceCallSettings: true,
      },
      orderBy: {
        eventDatetime: 'asc',
      },
    });
  }

  async findOne(userId: string, reminderId: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: {
        reminderId,
        userId,
      },
      include: {
        pushNotifications: true,
        voiceCallSettings: true,
      },
    });

    if (!reminder) {
      throw new NotFoundException('Hatırlatıcı bulunamadı.');
    }

    return reminder;
  }

  async update(userId: string, reminderId: string, dto: UpdateReminderDto) {
    await this.findOne(userId, reminderId);

    const userSettings = await this.prisma.userSetting.findUnique({
      where: {
        userId,
      },
      select: {
        timezone: true,
      },
    });

    if (!userSettings) {
      throw new BadRequestException(
        'Hatırlatıcı güncellemek için kullanıcı timezone ayarı gereklidir.',
      );
    }

    await this.prisma.reminder.update({
      where: {
        reminderId,
      },
      data: {
        ...(dto.title !== undefined && {
          title: dto.title.trim(),
        }),
        ...(dto.description !== undefined && {
          description: dto.description.trim(),
        }),
        ...(dto.eventDatetime !== undefined && {
          eventDatetime: this.timezoneService.toUtc(
            dto.eventDatetime,
            userSettings.timezone,
          ),
        }),
        ...(dto.repeatType !== undefined && {
          repeatType: dto.repeatType,
        }),
        ...(dto.repeatUntil !== undefined && {
          repeatUntil: dto.repeatUntil
            ? this.timezoneService.toUtc(dto.repeatUntil, userSettings.timezone)
            : null,
        }),
        ...(dto.isUrgent !== undefined && {
          isUrgent: dto.isUrgent,
        }),
      },
    });

    await this.schedulerService.rescheduleReminder(reminderId);

    return this.findOne(userId, reminderId);
  }

  async remove(userId: string, reminderId: string) {
    await this.findOne(userId, reminderId);

    await this.schedulerService.cancelReminderJobs(reminderId);

    await this.prisma.reminder.delete({
      where: {
        reminderId,
      },
    });

    return {
      message: 'Hatırlatıcı başarıyla silindi.',
    };
  }
}
