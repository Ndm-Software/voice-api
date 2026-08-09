import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { VoiceCallSettingsController } from './voice-call-settings.controller';
import { VoiceCallSettingsService } from './voice-call-settings.service';

@Module({
  imports: [PrismaModule],
  controllers: [VoiceCallSettingsController],
  providers: [VoiceCallSettingsService],
})
export class VoiceCallSettingsModule {}
