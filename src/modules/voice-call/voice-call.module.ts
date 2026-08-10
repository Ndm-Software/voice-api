import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { VoiceCallController } from './voice-call.controller';
import { VoiceCallService } from './voice-call.service';

@Module({
  imports: [ConfigModule],
  controllers: [VoiceCallController],
  providers: [VoiceCallService],
  exports: [VoiceCallService],
})
export class VoiceCallModule {}
