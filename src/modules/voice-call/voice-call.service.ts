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
    try {
      const from = this.configService.getOrThrow<string>('TWILIO_PHONE_NUMBER');
      const twiml = new twilio.twiml.VoiceResponse();

      twiml.say(
        {
          language: 'tr-TR',
          voice: 'alice',
        },
        message,
      );

      const call = await this.client.calls.create({
        to,
        from,
        twiml: twiml.toString(),
      });

      this.logger.log(`Voice call created: ${call.sid}`);

      return {
        success: true,
        callSid: call.sid,
        status: call.status,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown Twilio error';

      this.logger.error(`Twilio Arama Hatasi: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
