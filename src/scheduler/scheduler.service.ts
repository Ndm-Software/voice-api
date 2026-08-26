import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { DayOfWeek } from '../generated/prisma/enums';
import { JOB_NAMES, QUEUE_NAMES } from './constants/queue.constants';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,

    @InjectQueue(QUEUE_NAMES.PUSH_NOTIFICATION)
    private readonly pushQueue: Queue,

    @InjectQueue(QUEUE_NAMES.VOICE_CALL)
    private readonly voiceCallQueue: Queue,
  ) {}

  async scheduleReminder(reminderId: string) {
    this.logger.log(`scheduleReminder başladı. Reminder ID: ${reminderId}`);
    const reminder = await this.prisma.reminder.findUnique({
      where: {
        reminderId,
      },
      include: {
        pushNotifications: true,
        voiceCallSettings: true,
      },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found.');
    }

    if (reminder.status !== 'ACTIVE') {
      this.logger.warn(
        `Reminder ${reminderId} aktif değil. Job oluşturulmadı.`,
      );

      return;
    }
    this.logger.log(
      `Reminder bulundu. Push: ${reminder.pushNotifications.length}, Voice: ${reminder.voiceCallSettings.length}`,
    );

    for (const pushSetting of reminder.pushNotifications) {
      if (!pushSetting.enabled) {
        continue;
      }

      await this.schedulePushJob(
        reminder.reminderId,
        reminder.userId,
        reminder.eventDatetime,
        pushSetting.pushId,
        pushSetting.minutesBefore,
        reminder.isUrgent,
      );
    }

    for (const voiceSetting of reminder.voiceCallSettings) {
      this.logger.log(
        `Voice setting bulundu. Call ID: ${voiceSetting.callId}, enabled: ${voiceSetting.enabled}`,
      );

      if (!voiceSetting.enabled) {
        continue;
      }

      await this.scheduleVoiceCallJob(
        reminder.reminderId,
        reminder.userId,
        reminder.eventDatetime,
        voiceSetting.callId,
        voiceSetting.minutesBefore,
        reminder.isUrgent,
      );
    }
  }

  async rescheduleReminder(reminderId: string) {
    await this.cancelReminderJobs(reminderId);
    await this.scheduleReminder(reminderId);
  }

  async cancelReminderJobs(reminderId: string) {
    const reminder = await this.prisma.reminder.findUnique({
      where: {
        reminderId,
      },
      include: {
        pushNotifications: true,
        voiceCallSettings: true,
      },
    });

    if (!reminder) {
      return;
    }

    for (const pushSetting of reminder.pushNotifications) {
      if (!pushSetting.jobId) {
        continue;
      }

      const job = await this.pushQueue.getJob(pushSetting.jobId);

      if (job) {
        await job.remove();
      }
    }

    for (const voiceSetting of reminder.voiceCallSettings) {
      if (!voiceSetting.jobId) {
        continue;
      }

      const job = await this.voiceCallQueue.getJob(voiceSetting.jobId);

      if (job) {
        await job.remove();
      }
    }
  }

  private async schedulePushJob(
    reminderId: string,
    userId: string,
    eventDatetime: Date,
    pushId: string,
    minutesBefore: number,
    isUrgent: boolean = false,
  ) {
     const rawTargetDate = new Date(eventDatetime.getTime() - minutesBefore * 60 * 1000);
    const adjustedTargetDate = await this.adjustExecutionTimeForSilentHours(
      userId,
      rawTargetDate,
      isUrgent,
    );

const delay = adjustedTargetDate.getTime() - Date.now();
    if (delay <= 0) {
      this.logger.warn(
        `Push job geçmiş zamana denk geliyor. Push ID: ${pushId}`,
      );

      return;
    }

    const jobId = `push-${pushId}`;

    const job = await this.pushQueue.add(
      JOB_NAMES.SEND_PUSH_NOTIFICATION,
      {
        reminderId,
        userId,
        settingId: pushId,
      },
      {
        jobId,
        delay,
      },
    );

    await this.prisma.pushNotificationSetting.update({
      where: {
        pushId,
      },
      data: {
        jobId: String(job.id),
      },
    });

    this.logger.log(`Push job oluşturuldu. Job ID: ${job.id}`);
  }

  private async scheduleVoiceCallJob(
    reminderId: string,
    userId: string,
    eventDatetime: Date,
    callId: string,
    minutesBefore: number,
    isUrgent: boolean = false,
  ) {
        const rawTargetDate = new Date(eventDatetime.getTime() - minutesBefore * 60 * 1000);
    const adjustedTargetDate = await this.adjustExecutionTimeForSilentHours(
      userId,
      rawTargetDate,
      isUrgent,
    );

    const delay = adjustedTargetDate.getTime() - Date.now();
    this.logger.log(
      `Voice job planlanıyor. Event: ${eventDatetime.toISOString()}, minutesBefore: ${minutesBefore}`,
    );

    if (delay <= 0) {
      this.logger.warn(
        `Voice call job geçmiş zamana denk geliyor. Call ID: ${callId}`,
      );

      return;
    }

    const jobId = `voice-${callId}`;

    const job = await this.voiceCallQueue.add(
      JOB_NAMES.MAKE_VOICE_CALL,
      {
        reminderId,
        userId,
        settingId: callId,
      },
      {
        jobId,
        delay,
      },
    );

    await this.prisma.voiceCallSetting.update({
      where: {
        callId,
      },
      data: {
        jobId: String(job.id),
      },
    });

    this.logger.log(`Voice call job oluşturuldu. Job ID: ${job.id}`);
  }

  private calculateDelay(eventDatetime: Date, minutesBefore: number): number {
    const executionTime = eventDatetime.getTime() - minutesBefore * 60 * 1000;

    return executionTime - Date.now();
  }
  async handleRecurringReminder(reminderId: string) {
    try {
      const reminder = await this.prisma.reminder.findUnique({
        where: { reminderId },
        include: {
          user: {
            include: { userSetting: true },
          },
        },
      });

      if (!reminder || reminder.status !== 'ACTIVE' || reminder.repeatType === 'NONE') {
        return;
      }

      const userTimezone = reminder.user.userSetting?.timezone || 'UTC';
      const currentEventLocal = DateTime.fromJSDate(reminder.eventDatetime, { zone: userTimezone });

      let nextEventLocal: DateTime;

      switch (reminder.repeatType) {
        case 'DAILY':
          nextEventLocal = currentEventLocal.plus({ days: 1 });
          break;
        case 'WEEKLY':
          nextEventLocal = currentEventLocal.plus({ weeks: 1 });
          break;
        case 'MONTHLY':
          nextEventLocal = currentEventLocal.plus({ months: 1 });
          break;
        default:
          return;
      }

      const nextEventUtc = nextEventLocal.toUTC().toJSDate();

      if (reminder.repeatUntil && nextEventUtc > reminder.repeatUntil) {
        this.logger.log(`Reminder ${reminderId} repeatUntil sınırına ulaştı. COMPLETED yapılıyor.`);
        await this.prisma.reminder.update({
          where: { reminderId },
          data: { status: 'COMPLETED' },
        });
        return;
      }

      await this.prisma.reminder.update({
        where: { reminderId },
        data: { eventDatetime: nextEventUtc },
      });

      this.logger.log(`Reminder ${reminderId} bir sonraki periyoda güncellendi: ${nextEventUtc.toISOString()}`);
      await this.scheduleReminder(reminderId);
    } catch (error) {
      this.logger.error(`handleRecurringReminder hatası (Reminder ID: ${reminderId}):`, error);
    }
  }
  /**
   * Hedef çalışma zamanını kullanıcının sessiz saatlerine göre kontrol eder.
   * Acil (isUrgent: true) değilse ve hedef saat sessiz saat aralığına düşüyorsa
   * çalışma zamanını sessiz saatin bittiği ana kaydırır.
   */
  private async adjustExecutionTimeForSilentHours(
    userId: string,
    targetDate: Date,
    isUrgent: boolean,
  ): Promise<Date> {
    if (isUrgent) {
      return targetDate; // Acil ise sessiz saatleri aş (override)
    }

    const userSetting = await this.prisma.userSetting.findUnique({
      where: { userId },
      select: { timezone: true },
    });

    const userTimezone = userSetting?.timezone || 'UTC';
    let localTarget = DateTime.fromJSDate(targetDate, { zone: userTimezone });

    // Haftanın gününü Prisma DayOfWeek enum formatına çevir (MONDAY, TUESDAY...)
    const DAYS_MAP: Record<number, DayOfWeek> = {
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
  7: DayOfWeek.SUNDAY,
};

const dayName = DAYS_MAP[localTarget.weekday];
    const silentHour = await this.prisma.silentHour.findFirst({
      where: {
        userId,
        dayOfWeek: dayName,
      },
    });

    if (!silentHour) {
      return targetDate;
    }

    // DB'deki 1970-01-01T... tarihinden saat ve dakikayı al
    const startStart = DateTime.fromJSDate(silentHour.silentStart, { zone: 'utc' });
    const endStart = DateTime.fromJSDate(silentHour.silentEnd, { zone: 'utc' });

    const silentStartLocal = localTarget.set({
      hour: startStart.hour,
      minute: startStart.minute,
      second: 0,
      millisecond: 0,
    });

    let silentEndLocal = localTarget.set({
      hour: endStart.hour,
      minute: endStart.minute,
      second: 0,
      millisecond: 0,
    });

    // Gece yarısını aşan saatler için (Örn: 22:00 - 07:00)
    if (silentEndLocal <= silentStartLocal) {
      if (localTarget >= silentStartLocal) {
        // Hedef saat 22:00'den sonra ise bitiş ertesi gün 07:00'dir
        silentEndLocal = silentEndLocal.plus({ days: 1 });
      } else {
        // Hedef saat gece yarısından sonra (örn 03:00) ise başlangıç dün 22:00'dir
        const yesterdayStart = silentStartLocal.minus({ days: 1 });
        if (localTarget < silentEndLocal && localTarget >= yesterdayStart) {
          // Zaten bugünün silentEndLocal'i bittiği andır
        } else {
          return targetDate;
        }
      }
    }

    // Hedef zaman sessiz saat aralığında mı?
    if (localTarget >= silentStartLocal && localTarget < silentEndLocal) {
      this.logger.log(
        `Hedef zaman (${localTarget.toFormat('HH:mm')}) sessiz saatlere denk geliyor (${silentStartLocal.toFormat('HH:mm')} - ${silentEndLocal.toFormat('HH:mm')}). Erteleniyor...`
      );
      return silentEndLocal.toUTC().toJSDate();
    }

    return targetDate;
  }
}
