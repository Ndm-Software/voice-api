import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RedisIntegrationModule } from '../redis/redis-integration.module';
import { TwilioOtpProviderFactory } from './twilio-otp-provider.factory';
import { twilioVoiceClientProvider } from './twilio-voice-client.provider';
import { TwilioVoiceService } from './twilio-voice.service';

@Module({
  imports: [ConfigModule, RedisIntegrationModule],
  providers: [
    TwilioOtpProviderFactory,
    twilioVoiceClientProvider,
    TwilioVoiceService,
  ],
  exports: [TwilioOtpProviderFactory, TwilioVoiceService],
})
export class TwilioIntegrationModule {}
