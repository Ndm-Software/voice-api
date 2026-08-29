import { Global, Module } from '@nestjs/common';

import { TwilioIntegrationModule } from '../../integrations/twilio/twilio-integration.module';
import { RedisIntegrationModule } from '../../integrations/redis/redis-integration.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { OTP_PROVIDER } from './contracts/otp-provider.interface';
import { OtpChallengeStore } from './otp-challenge.store';
import { OtpController } from './otp.controller';
import { OtpProviderFactory } from './otp-provider.factory';
import { OtpSecurityService } from './otp-security.service';
import { OtpService } from './otp.service';
import { OtpWorkflowService } from './otp-workflow.service';

@Global()
@Module({
  imports: [TwilioIntegrationModule, RedisIntegrationModule, PrismaModule],
  controllers: [OtpController],
  providers: [
    OtpService,
    OtpSecurityService,
    OtpChallengeStore,
    OtpWorkflowService,
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
