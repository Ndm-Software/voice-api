import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue } from 'bull';
import { DateTime } from 'luxon';

import { DayOfWeek } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  JOB_NAMES,
  PUSH_JOB_STATE_PREFIXES,
  QUEUE_NAMES,
  VOICE_JOB_STATE_PREFIXES,
} from './constants/queue.constants';

import { RedisService } from '../integrations/redis/redis.service';
import {
  TWILIO_VOICE_CALL_KEY_PREFIX,
  TWILIO_VOICE_CALLBACK_PROCESSED_KEY_PREFIX,
} from '../integrations/twilio/twilio-voice.constants';
import { HistoryStatus } from '../generated/prisma/client';
import { ReminderHistoryService } from '../modules/reminder-history/reminder-history.service';

interface ScheduledJobTransition {
  kind: 'push' | 'voice';
  settingId: string;
  previousJobId: string | null;
  scheduledJobId: string;
}

const DAYS_BY_ISO_WEEKDAY: Record<number, DayOfWeek> = {
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
  7: DayOfWeek.SUNDAY,
};
const SILENT_HOUR_LOOKAHEAD_DAYS = 7;

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,

    @InjectQueue(QUEUE_NAMES.PUSH_NOTIFICATION)
    private readonly pushQueue: Queue,

    @InjectQueue(QUEUE_NAMES.VOICE_CALL)
    private readonly voiceCallQueue: Queue,

    private readonly redisService: RedisService,
    private readonly reminderHistoryService: ReminderHistoryService,
  ) {}

  async scheduleReminder(reminderId: string): Promise<void> {
    this.logger.log(`scheduleReminder başladı. Reminder ID: ${reminderId}`);

    const reminder = await this.prisma.reminder.findUnique({
      where: { reminderId },
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

    const scheduledTransitions: ScheduledJobTransition[] = [];

    try {
      for (const pushSetting of reminder.pushNotifications) {
        if (!pushSetting.enabled) {
          continue;
        }

        const scheduledJobId = await this.schedulePushJob(
          reminder.reminderId,
          reminder.userId,
          reminder.eventDatetime,
          pushSetting.pushId,
          pushSetting.minutesBefore,
          pushSetting.jobId,
        );

        if (scheduledJobId) {
          scheduledTransitions.push({
            kind: 'push',
            settingId: pushSetting.pushId,
            previousJobId: pushSetting.jobId,
            scheduledJobId,
          });
        }
      }

      for (const voiceSetting of reminder.voiceCallSettings) {
        if (!voiceSetting.enabled) {
          continue;
        }

        const scheduledJobId = await this.scheduleVoiceCallJob(
          reminder.reminderId,
          reminder.userId,
          reminder.eventDatetime,
          voiceSetting.callId,
          voiceSetting.minutesBefore,
          voiceSetting.jobId,
        );

        if (scheduledJobId) {
          scheduledTransitions.push({
            kind: 'voice',
            settingId: voiceSetting.callId,
            previousJobId: voiceSetting.jobId,
            scheduledJobId,
          });
        }
      }
    } catch (error: unknown) {
      await this.rollbackScheduledJobs(scheduledTransitions);
      throw error;
    }
  }

  async rescheduleReminder(reminderId: string): Promise<void> {
    await this.cancelReminderJobs(reminderId);
    await this.scheduleReminder(reminderId);
  }

  async cancelReminderJobs(reminderId: string): Promise<void> {
    const reminder = await this.prisma.reminder.findUnique({
      where: { reminderId },
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

      const job = await this.pushQueue.getJob(
        this.getPushQueueJobId(pushSetting.jobId),
      );
      if (job) {
        await job.remove();
      }
    }

    for (const voiceSetting of reminder.voiceCallSettings) {
      if (!voiceSetting.jobId) {
        continue;
      }

      const job = await this.voiceCallQueue.getJob(
        this.getVoiceQueueJobId(voiceSetting.jobId),
      );
      if (job) {
        await job.remove();
      }
    }
  }

  async handleVoiceCallStatus(data: {
    callSid: string;
    callStatus: string;
  }): Promise<void> {
    const terminalStatus = data.callStatus.toLowerCase();

    // Ara durumları işlemiyoruz.
    if (
      terminalStatus === 'initiated' ||
      terminalStatus === 'ringing' ||
      terminalStatus === 'answered'
    ) {
      this.logger.log(
        `Twilio voice call ara durumu: ${terminalStatus}. Call SID: ${data.callSid}`,
      );

      return;
    }

    const terminalStatuses = new Set([
      'completed',
      'no-answer',
      'busy',
      'failed',
      'canceled',
    ]);

    if (!terminalStatuses.has(terminalStatus)) {
      this.logger.warn(
        `Bilinmeyen Twilio call status: ${terminalStatus}. ` +
          `Call SID: ${data.callSid}`,
      );

      return;
    }

    const callKey = `${TWILIO_VOICE_CALL_KEY_PREFIX}${data.callSid}`;

    const callDataRaw = await this.redisService.get(callKey);

    if (!callDataRaw) {
      this.logger.warn(
        `Twilio callback için Redis kaydı bulunamadı. ` +
          `Call SID: ${data.callSid}`,
      );

      return;
    }

    let callData: {
      reminderId: string;
      userId: string;
      settingId: string;
      scheduledFor: string;
      attempt: number;
      jobId: string;
      historyId?: string | null;
    };

    try {
      callData = JSON.parse(callDataRaw) as typeof callData;
    } catch (error: unknown) {
      this.logger.error(
        `Twilio callback Redis verisi parse edilemedi. ` +
          `Call SID: ${data.callSid}`,
        error instanceof Error ? error.stack : undefined,
      );

      return;
    }

    /*
     * Sadece terminal callback'lerde idempotency uyguluyoruz.
     * Böylece initiated/ringing/answered callback'leri
     * completed callback'ini engellemez.
     */
    const processedKey = `${TWILIO_VOICE_CALLBACK_PROCESSED_KEY_PREFIX}${data.callSid}`;

    const firstProcess = await this.redisService.setIfAbsentWithExpiry(
      processedKey,
      '1',
      60 * 60,
    );

    if (!firstProcess) {
      this.logger.warn(
        `Twilio terminal callback daha önce işlendi. ` +
          `Call SID: ${data.callSid}`,
      );

      return;
    }

    /*
     * completed = çağrı Twilio tarafında tamamlandı.
     */
    if (terminalStatus === 'completed') {
      if (callData.historyId) {
        await this.reminderHistoryService.updateStatus(
          callData.historyId,
          HistoryStatus.SUCCESS,
        );
      }

      await this.clearVoiceCallJob(
        callData.settingId,
        `attempting:${callData.jobId}`,
      );

      await this.handleRecurringReminder(
        callData.reminderId,
        callData.scheduledFor,
        callData.settingId,
      );

      await this.redisService.delete(callKey);

      this.logger.log(`Twilio voice call SUCCESS. Call SID: ${data.callSid}`);

      return;
    }

    /*
     * no-answer / busy / failed / canceled
     */
    const errorMessage = `Twilio call status: ${terminalStatus}`;

    if (callData.historyId) {
      await this.reminderHistoryService.updateStatus(
        callData.historyId,
        HistoryStatus.FAILED,
        errorMessage,
      );
    }

    /*
     * İlk deneme başarısızsa 2 dakika sonra ikinci deneme.
     */
    if (callData.attempt < 2) {
      const retryJob = await this.voiceCallQueue.add(
        JOB_NAMES.MAKE_VOICE_CALL,
        {
          reminderId: callData.reminderId,
          userId: callData.userId,
          settingId: callData.settingId,
          scheduledFor: callData.scheduledFor,
          attempt: callData.attempt + 1,
        },
        {
          delay: 2 * 60 * 1000,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      await this.prisma.voiceCallSetting.updateMany({
        where: {
          callId: callData.settingId,
          enabled: true,
          jobId: `attempting:${callData.jobId}`,
        },
        data: {
          jobId: String(retryJob.id),
          retryCount: {
            increment: 1,
          },
        },
      });

      await this.redisService.delete(callKey);

      this.logger.warn(
        `Twilio voice call başarısız. ` +
          `2 dakika sonra retry planlandı. ` +
          `Call SID: ${data.callSid}, ` +
          `Attempt: ${callData.attempt}`,
      );

      return;
    }

    /*
     * İkinci deneme de başarısız.
     */
    await this.clearVoiceCallJob(
      callData.settingId,
      `attempting:${callData.jobId}`,
    );

    await this.handleRecurringReminder(
      callData.reminderId,
      callData.scheduledFor,
      callData.settingId,
    );

    await this.redisService.delete(callKey);

    this.logger.error(
      `Twilio voice call maksimum deneme sayısına ulaştı. ` +
        `Call SID: ${data.callSid}`,
    );
  }

  async handleRecurringReminder(
    reminderId: string,
    scheduledFor: string | undefined,
    completedSettingId: string,
  ): Promise<void> {
    try {
      if (!scheduledFor) {
        this.logger.warn(
          `Tekrarlı reminder occurrence zamanı bulunamadı. Reminder ID: ${reminderId}`,
        );
        return;
      }

      const expectedEventDatetime = new Date(scheduledFor);
      if (Number.isNaN(expectedEventDatetime.getTime())) {
        this.logger.warn(
          `Tekrarlı reminder için geçersiz occurrence zamanı. Reminder ID: ${reminderId}`,
        );
        return;
      }

      const reminder = await this.prisma.reminder.findUnique({
        where: { reminderId },
        include: {
          pushNotifications: true,
          voiceCallSettings: true,
          user: {
            include: { userSetting: true },
          },
        },
      });

      if (
        !reminder ||
        reminder.status !== 'ACTIVE' ||
        reminder.repeatType === 'NONE' ||
        reminder.eventDatetime.getTime() !== expectedEventDatetime.getTime()
      ) {
        return;
      }

      const enabledSettings = [
        ...reminder.pushNotifications
          .filter((setting) => setting.enabled)
          .map((setting) => ({
            id: setting.pushId,
            minutesBefore: setting.minutesBefore,
          })),
        ...reminder.voiceCallSettings
          .filter((setting) => setting.enabled)
          .map((setting) => ({
            id: setting.callId,
            minutesBefore: setting.minutesBefore,
          })),
      ];
      const completedSetting = enabledSettings.find(
        (setting) => setting.id === completedSettingId,
      );
      const latestMinutesBefore = Math.min(
        ...enabledSettings.map((setting) => setting.minutesBefore),
      );

      if (
        !completedSetting ||
        completedSetting.minutesBefore !== latestMinutesBefore
      ) {
        return;
      }

      const userTimezone = reminder.user.userSetting?.timezone || 'UTC';
      const currentEventLocal = DateTime.fromJSDate(reminder.eventDatetime, {
        zone: userTimezone,
      });

      if (!currentEventLocal.isValid) {
        this.logger.error(
          `Reminder timezone yapılandırması geçersiz. Reminder ID: ${reminderId}`,
        );
        return;
      }

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
        await this.prisma.reminder.updateMany({
          where: {
            reminderId,
            status: 'ACTIVE',
            eventDatetime: expectedEventDatetime,
          },
          data: { status: 'COMPLETED' },
        });
        return;
      }

      const advancedReminder = await this.prisma.reminder.updateMany({
        where: {
          reminderId,
          status: 'ACTIVE',
          eventDatetime: expectedEventDatetime,
        },
        data: { eventDatetime: nextEventUtc },
      });

      if (advancedReminder.count !== 1) {
        return;
      }

      this.logger.log(
        `Reminder ${reminderId} bir sonraki periyoda güncellendi: ${nextEventUtc.toISOString()}`,
      );

      try {
        await this.scheduleReminder(reminderId);
      } catch (error: unknown) {
        const rollback = await this.prisma.reminder.updateMany({
          where: {
            reminderId,
            status: 'ACTIVE',
            eventDatetime: nextEventUtc,
          },
          data: { eventDatetime: expectedEventDatetime },
        });

        if (rollback.count !== 1) {
          this.logger.error(
            `Tekrarlı reminder tarihi geri alınamadı. Reminder ID: ${reminderId}`,
          );
        }

        throw error;
      }
    } catch (error: unknown) {
      this.logger.error(
        `Tekrarlı reminder planlanamadı. Reminder ID: ${reminderId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async schedulePushJob(
    reminderId: string,
    userId: string,
    eventDatetime: Date,
    pushId: string,
    minutesBefore: number,
    previousJobId: string,
  ): Promise<string | null> {
    const targetDate = new Date(
      eventDatetime.getTime() - minutesBefore * 60 * 1000,
    );
    const adjustedTargetDate = await this.adjustExecutionTimeForSilentHours(
      userId,
      targetDate,
    );
    const delay = adjustedTargetDate.getTime() - Date.now();

    if (delay <= 0) {
      this.logger.warn(
        `Push job geçmiş zamana denk geliyor. Push ID: ${pushId}`,
      );
      return null;
    }

    const jobId = `push-${pushId}-${adjustedTargetDate.getTime()}`;
    const job = await this.pushQueue.add(
      JOB_NAMES.SEND_PUSH_NOTIFICATION,
      {
        reminderId,
        userId,
        settingId: pushId,
        scheduledFor: eventDatetime.toISOString(),
      },
      {
        jobId,
        delay,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    const scheduledSetting =
      await this.prisma.pushNotificationSetting.updateMany({
        where: { pushId, enabled: true, jobId: previousJobId },
        data: { jobId: String(job.id) },
      });

    if (scheduledSetting.count !== 1) {
      throw new Error('Push notification setting changed while scheduling');
    }

    return String(job.id);
  }

  private async scheduleVoiceCallJob(
    reminderId: string,
    userId: string,
    eventDatetime: Date,
    callId: string,
    minutesBefore: number,
    previousJobId: string | null,
  ): Promise<string | null> {
    const targetDate = new Date(
      eventDatetime.getTime() - minutesBefore * 60 * 1000,
    );

    const adjustedTargetDate = await this.adjustExecutionTimeForSilentHours(
      userId,
      targetDate,
    );

    const delay = adjustedTargetDate.getTime() - Date.now();

    if (delay <= 0) {
      this.logger.warn(
        `Voice call job geçmiş zamana denk geliyor. Call ID: ${callId}`,
      );
      return null;
    }

    const jobId = `voice-${callId}-${adjustedTargetDate.getTime()}`;

    const job = await this.voiceCallQueue.add(
      JOB_NAMES.MAKE_VOICE_CALL,
      {
        reminderId,
        userId,
        settingId: callId,
        scheduledFor: eventDatetime.toISOString(),
      },
      {
        jobId,
        delay,

        // İlk deneme + maksimum 1 retry = toplam 2 deneme
        attempts: 2,

        // İlk arama başarısız olursa 2 dakika sonra tekrar dene
        backoff: {
          type: 'fixed',
          delay: 2 * 60 * 1000,
        },

        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    const scheduledSetting = await this.prisma.voiceCallSetting.updateMany({
      where: {
        callId,
        enabled: true,
        jobId: previousJobId,
      },
      data: {
        jobId: String(job.id),
      },
    });

    if (scheduledSetting.count !== 1) {
      throw new Error('Voice call setting changed while scheduling');
    }

    return String(job.id);
  }

  private async adjustExecutionTimeForSilentHours(
    userId: string,
    targetDate: Date,
  ): Promise<Date> {
    const userSetting = await this.prisma.userSetting.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    const userTimezone = userSetting?.timezone || 'UTC';
    const localTarget = DateTime.fromJSDate(targetDate, {
      zone: userTimezone,
    });

    if (!localTarget.isValid) {
      this.logger.warn(
        `Sessiz saat kontrolü için timezone geçersiz. User ID: ${userId}`,
      );
      return targetDate;
    }

    const silentHours = await this.prisma.silentHour.findMany({
      where: { userId },
    });

    const silentRanges = Array.from(
      { length: SILENT_HOUR_LOOKAHEAD_DAYS + 2 },
      (_, index) => index - 1,
    ).flatMap((dayOffset) => {
      const intervalDay = localTarget.plus({ days: dayOffset });
      const dayOfWeek = DAYS_BY_ISO_WEEKDAY[intervalDay.weekday];

      return silentHours
        .filter((silentHour) => silentHour.dayOfWeek === dayOfWeek)
        .map((silentHour) => {
          const startTime = DateTime.fromJSDate(silentHour.silentStart, {
            zone: 'utc',
          });
          const endTime = DateTime.fromJSDate(silentHour.silentEnd, {
            zone: 'utc',
          });
          const silentStart = intervalDay.set({
            hour: startTime.hour,
            minute: startTime.minute,
            second: 0,
            millisecond: 0,
          });
          let silentEnd = intervalDay.set({
            hour: endTime.hour,
            minute: endTime.minute,
            second: 0,
            millisecond: 0,
          });

          if (silentEnd <= silentStart) {
            silentEnd = silentEnd.plus({ days: 1 });
          }

          return { silentStart, silentEnd };
        });
    });
    const adjustmentLimit = localTarget.plus({
      days: SILENT_HOUR_LOOKAHEAD_DAYS,
    });
    let adjustedTarget = localTarget;
    let rangeExtended = true;

    while (rangeExtended) {
      rangeExtended = false;

      for (const range of silentRanges) {
        if (
          adjustedTarget >= range.silentStart &&
          adjustedTarget < range.silentEnd &&
          range.silentEnd > adjustedTarget
        ) {
          adjustedTarget = range.silentEnd;
          rangeExtended = true;
        }
      }
    }

    if (adjustedTarget >= adjustmentLimit) {
      throw new Error(
        'No execution window is available outside configured silent hours',
      );
    }

    if (adjustedTarget > localTarget) {
      this.logger.log(
        `Planlanan iş sessiz saat sonuna ertelendi. User ID: ${userId}`,
      );
      return adjustedTarget.toUTC().toJSDate();
    }

    return targetDate;
  }

  private async rollbackScheduledJobs(
    transitions: ScheduledJobTransition[],
  ): Promise<void> {
    for (const transition of [...transitions].reverse()) {
      try {
        const queue =
          transition.kind === 'push' ? this.pushQueue : this.voiceCallQueue;

        const queueJobId =
          transition.kind === 'push'
            ? this.getPushQueueJobId(transition.scheduledJobId)
            : this.getVoiceQueueJobId(transition.scheduledJobId);

        const job = await queue.getJob(queueJobId);

        if (job) {
          await job.remove();
        }
      } catch (error) {
        this.logger.error(
          `Queue rollback başarısız. Setting ID: ${transition.settingId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    await this.restoreScheduledJobIds(transitions);
  }

  private async restoreScheduledJobIds(
    transitions: ScheduledJobTransition[],
  ): Promise<void> {
    for (const transition of transitions.reverse()) {
      if (transition.kind === 'push') {
        await this.prisma.pushNotificationSetting.updateMany({
          where: {
            pushId: transition.settingId,
            jobId: transition.scheduledJobId,
          },
          data: { jobId: transition.previousJobId ?? '' },
        });
        continue;
      }

      await this.prisma.voiceCallSetting.updateMany({
        where: {
          callId: transition.settingId,
          jobId: transition.scheduledJobId,
        },
        data: { jobId: transition.previousJobId },
      });
    }
  }

  private getPushQueueJobId(storedJobId: string): string {
    for (const prefix of Object.values(PUSH_JOB_STATE_PREFIXES)) {
      if (storedJobId.startsWith(prefix)) {
        return storedJobId.slice(prefix.length);
      }
    }

    return storedJobId;
  }

  private getVoiceQueueJobId(storedJobId: string): string {
    for (const prefix of Object.values(VOICE_JOB_STATE_PREFIXES)) {
      if (storedJobId.startsWith(prefix)) {
        return storedJobId.slice(prefix.length);
      }
    }

    return storedJobId;
  }

  private async clearVoiceCallJob(
    callId: string,
    jobId: string,
  ): Promise<void> {
    await this.prisma.voiceCallSetting.updateMany({
      where: {
        callId,
        jobId,
      },
      data: {
        jobId: null,
      },
    });
  }
}
