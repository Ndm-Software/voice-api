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

      const twimlUrl =
        this.configService.getOrThrow<string>('TWILIO_TWIML_URL');

      const call = await this.client.calls.create({
        to,
        from,
        url: `${twimlUrl}?message=${encodeURIComponent(message)}`,
        method: 'GET',
      });

      this.logger.log(`Voice call created: ${call.sid}`);

      return {
        success: true,
        callSid: call.sid,
        status: call.status,
      };
    } catch (error: any) {
      this.logger.error(`Twilio Arama Hatasi: ${error.message}`);

      return {
        success: false,
        error: error.message,
      };
    }
  }
}
