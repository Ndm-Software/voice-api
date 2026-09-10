import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerService } from '../../scheduler/scheduler.service';
import { CreateVoiceCallSettingDto } from './dto/create-voice-call-setting.dto';
import { UpdateVoiceCallSettingDto } from './dto/update-voice-call-setting.dto';

@Injectable()
export class VoiceCallSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerService: SchedulerService,
  ) {}

  async create(dto: CreateVoiceCallSettingDto, userId: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: {
        reminderId: dto.reminderId,
        userId,
      },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found.');
    }

    const voiceCallSetting = await this.prisma.voiceCallSetting.create({
      data: {
        reminderId: dto.reminderId,
        minutesBefore: dto.minutesBefore,
        enabled: dto.enabled,
      },
    });

    await this.schedulerService.rescheduleReminder(dto.reminderId);

    return {
      message: 'Voice call setting created successfully.',
      voiceCallSetting,
    };
  }

  async findAll(userId: string) {
    return this.prisma.voiceCallSetting.findMany({
      where: {
        reminder: {
          userId,
        },
      },
      include: {
        reminder: true,
      },
    });
  }

  async findOne(id: string, userId: string) {
    const voiceCallSetting = await this.prisma.voiceCallSetting.findFirst({
      where: {
        callId: id,
        reminder: {
          userId,
        },
      },
      include: {
        reminder: true,
      },
    });

    if (!voiceCallSetting) {
      throw new NotFoundException('Voice call setting not found.');
    }

    return voiceCallSetting;
  }

  async update(id: string, dto: UpdateVoiceCallSettingDto, userId: string) {
    const setting = await this.findOne(id, userId);

    const updatedVoiceCallSetting = await this.prisma.voiceCallSetting.update({
      where: {
        callId: id,
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

    return {
      message: 'Voice call setting updated successfully.',
      voiceCallSetting: updatedVoiceCallSetting,
    };
  }

  async remove(id: string, userId: string) {
    const setting = await this.findOne(id, userId);

    await this.prisma.voiceCallSetting.delete({
      where: {
        callId: id,
      },
    });

    await this.schedulerService.rescheduleReminder(setting.reminderId);

    return {
      message: 'Voice call setting deleted successfully.',
    };
  }
}
