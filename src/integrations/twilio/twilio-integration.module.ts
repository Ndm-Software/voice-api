import { Module } from '@nestjs/common';

import { TwilioOtpProviderFactory } from './twilio-otp-provider.factory';

@Module({
  providers: [TwilioOtpProviderFactory],
  exports: [TwilioOtpProviderFactory],
})
export class TwilioIntegrationModule {}
