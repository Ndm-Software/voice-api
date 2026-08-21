import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TwilioOtpProviderFactory } from '../../integrations/twilio/twilio-otp-provider.factory';
import { OtpProvider } from './contracts/otp-provider.interface';
import { FakeOtpProvider } from './testing/fake-otp.provider';

@Injectable()
export class OtpProviderFactory {
  constructor(
    private readonly configService: ConfigService,
    private readonly twilioProviderFactory: TwilioOtpProviderFactory,
  ) {}

  create(): OtpProvider {
    const providerName = this.configService.getOrThrow<string>('otp.provider');

    if (providerName === 'fake') {
      const fakeCode = this.configService.getOrThrow<string>('otp.fakeCode');

      return new FakeOtpProvider(fakeCode);
    }

    if (providerName === 'twilio') {
      return this.twilioProviderFactory.create();
    }

    throw new Error(`Unsupported OTP provider: ${providerName}`);
  }
}
