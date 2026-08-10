import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio, { Twilio } from 'twilio';

@Injectable()
export class VoiceCallService {
  private readonly logger = new Logger(VoiceCallService.name);
  private readonly client: Twilio;

  constructor(private readonly configService: ConfigService) {
    this.client = twilio(
      this.configService.getOrThrow<string>('TWILIO_ACCOUNT_SID'),
      this.configService.getOrThrow<string>('TWILIO_AUTH_TOKEN'),
    );
  }

  async makeCall(to: string, message: string) {
    const from = this.configService.getOrThrow<string>('TWILIO_PHONE_NUMBER');

    const call = await this.client.calls.create({
      to,
      from,
      twiml: `
        <Response>
          <Say language="tr-TR">
            ${message}
          </Say>
        </Response>
      `,
    });

    this.logger.log(`Voice call created: ${call.sid}`);

    return {
      success: true,
      callSid: call.sid,
      status: call.status,
    };
  }
}
