import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateVoiceCallSettingDto } from './dto/create-voice-call-setting.dto';
import { UpdateVoiceCallSettingDto } from './dto/update-voice-call-setting.dto';

@Injectable()
export class VoiceCallSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateVoiceCallSettingDto) {
    // hatırlatıcı var mı diye kontrol eder eğer varsa ayarı oluşturur
    const reminder = await this.prisma.reminder.findUnique({
      where: {
        reminderId: dto.reminderId,
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

    return {
      message: 'Voice call setting created successfully.',
      voiceCallSetting,
    };
  }

  async findAll() {
    return await this.prisma.voiceCallSetting.findMany({
      include: {
        reminder: true,
      },
    });
  }

  async findOne(id: string) {
    const voiceCallSetting = await this.prisma.voiceCallSetting.findUnique({
      where: {
        callId: id,
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

  async update(id: string, dto: UpdateVoiceCallSettingDto) {
    await this.findOne(id);

    const updatedVoiceCallSetting = await this.prisma.voiceCallSetting.update({
      where: {
        callId: id,
      },
      data: {
        minutesBefore: dto.minutesBefore,
        enabled: dto.enabled,
      },
    });

    return {
      message: 'Voice call setting updated successfully.',
      voiceCallSetting: updatedVoiceCallSetting,
    };
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.voiceCallSetting.delete({
      where: {
        callId: id,
      },
    });

    return {
      message: 'Voice call setting deleted successfully.',
    };
  }
}
