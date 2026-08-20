import { Module } from '@nestjs/common';
import { TwilioIntegrationModule } from '../../integrations/twilio/twilio-integration.module';
import { VoiceCallController } from './voice-call.controller';
import { VoiceCallService } from './voice-call.service';

@Module({
  imports: [TwilioIntegrationModule],
  controllers: [VoiceCallController],
  providers: [VoiceCallService],
  exports: [VoiceCallService],
})
export class VoiceCallModule {}
