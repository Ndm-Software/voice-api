import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

import { TwilioOtpProvider } from './twilio-otp.provider';

@Injectable()
export class TwilioOtpProviderFactory {
  constructor(private readonly configService: ConfigService) {}

  create(): TwilioOtpProvider {
    const accountSid =
      this.configService.getOrThrow<string>('twilio.accountSid');
    const authToken = this.configService.getOrThrow<string>('twilio.authToken');
    const client = twilio(accountSid, authToken);

    return new TwilioOtpProvider(client, this.configService);
  }
}
