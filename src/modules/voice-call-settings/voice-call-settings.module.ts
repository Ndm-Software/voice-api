import { Module } from '@nestjs/common';
import { VoiceCallSettingsService } from './voice-call-settings.service';
import { VoiceCallSettingsController } from './voice-call-settings.controller';

@Module({
  providers: [VoiceCallSettingsService],
  controllers: [VoiceCallSettingsController]
})
export class VoiceCallSettingsModule {}
