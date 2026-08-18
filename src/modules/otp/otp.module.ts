import { Global, Module } from '@nestjs/common';

import { TwilioIntegrationModule } from '../../integrations/twilio/twilio-integration.module';
import { RedisIntegrationModule } from '../../integrations/redis/redis-integration.module';
import { OTP_PROVIDER } from './contracts/otp-provider.interface';
import { OtpProviderFactory } from './otp-provider.factory';
import { OtpSecurityService } from './otp-security.service';
import { OtpService } from './otp.service';

@Global()
@Module({
  imports: [TwilioIntegrationModule, RedisIntegrationModule],
  providers: [
    OtpService,
    OtpSecurityService,
    OtpProviderFactory,
    {
      provide: OTP_PROVIDER,
      inject: [OtpProviderFactory],
      useFactory: (providerFactory: OtpProviderFactory) =>
        providerFactory.create(),
    },
  ],
  exports: [OtpService, OtpSecurityService, OTP_PROVIDER],
})
export class OtpModule {}
