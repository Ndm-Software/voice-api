import { BadRequestException,Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerService } from '../../scheduler/scheduler.service';
import { TimezoneService } from '../../common/services/timezone.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerService: SchedulerService,
    private readonly timezoneService: TimezoneService,
  ) {}

  async create(userId: string, dto: CreateReminderDto) {
     /*
     * Kullanıcının timezone bilgisini alıyoruz.
     */  
    const userSettings =
      await this.prisma.userSetting.findUnique({
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

     /*
     * Frontend'den gelen local tarihi
     * kullanıcının timezone'una göre UTC'ye çeviriyoruz.
     *
     * Örnek:
     *
     * Frontend:
     * 2026-08-20T15:00:00
     *
     * timezone:
     * Europe/Istanbul
     *
     * DB:
     * 2026-08-20T12:00:00.000Z
     */
        const eventDatetime =
      this.timezoneService.toUtc(
        dto.eventDatetime,
        userSettings.timezone,
      );

       /*
     * repeatUntil varsa onu da aynı timezone
     * mantığıyla UTC'ye çeviriyoruz.
     */
    const repeatUntil = dto.repeatUntil
      ? this.timezoneService.toUtc(
          dto.repeatUntil,
          userSettings.timezone,
        )
      : undefined;

    const reminder = await this.prisma.reminder.create({
      data: {
        userId,
        title: dto.title.trim(),
        description: dto.description?.trim(),
        eventDatetime: new Date(dto.eventDatetime),
        repeatType: dto.repeatType,
        repeatUntil: dto.repeatUntil ? new Date(dto.repeatUntil) : undefined,
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

    console.log('Scheduler çağrılacak. Reminder ID:', reminder.reminderId);
    // Scheduler entegrasyonu:
    // Reminder ve setting kayıtları oluşturulduktan sonra
    // Redis/Bull joblarını planlar.
    await this.schedulerService.scheduleReminder(reminder.reminderId);

    console.log('Scheduler çağrısı tamamlandı.');
    return this.findOne(userId, reminder.reminderId);
  }

  async findAll(userId: string) {
    return this.prisma.reminder.findMany({
      where: {
        userId,
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

     /*
     * Reminder zamanı değişebilir.
     * Bu yüzden update sırasında da
     * kullanıcının timezone bilgisini alıyoruz.
     */
    const userSettings =
      await this.prisma.userSetting.findUnique({
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

       ...(dto.eventDatetime !==
          undefined && {
          eventDatetime:
            this.timezoneService.toUtc(
              dto.eventDatetime,
              userSettings.timezone,
            ),
        }),
        ...(dto.repeatType !== undefined && {
          repeatType: dto.repeatType,
        }),

        ...(dto.repeatUntil !==
          undefined && {
          repeatUntil:
            dto.repeatUntil
              ? this.timezoneService.toUtc(
                  dto.repeatUntil,
                  userSettings.timezone,
                )
              : null,
        }),

        ...(dto.isUrgent !== undefined && {
          isUrgent: dto.isUrgent,
        }),
      },
    });

    // Scheduler entegrasyonu:
    // Reminder zamanı değişmiş olabilir.
    // Eski jobları kaldırıp yeni zamana göre tekrar oluşturur.
    await this.schedulerService.rescheduleReminder(reminderId);

    return this.findOne(userId, reminderId);
  }

  async remove(userId: string, reminderId: string) {
    await this.findOne(userId, reminderId);

    // Reminder silinmeden önce Redis'teki jobları kaldır.
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
