import {
  Body,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

import { Public } from '../common/decorators/public.decorator';
import { SchedulerService } from './scheduler.service';

interface TwilioVoiceStatusBody {
  CallSid?: string;
  CallStatus?: string;
}

@Controller('voice-call')
export class VoiceCallStatusController {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('status')
  async handleStatus(
    @Headers('x-twilio-signature')
    signature: string | undefined,

    @Body()
    body: TwilioVoiceStatusBody,
  ): Promise<{ received: boolean }> {
    const callSid = body.CallSid;
    const callStatus = body.CallStatus;

    if (!callSid || !callStatus) {
      throw new HttpException(
        'Invalid Twilio callback payload.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!signature) {
      throw new HttpException(
        'Missing Twilio signature.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const authToken = this.configService.getOrThrow<string>('twilio.authToken');

    const callbackUrl = this.configService.getOrThrow<string>(
      'twilio.voiceStatusCallbackUrl',
    );

    const isValid = twilio.validateRequest(
      authToken,
      signature,
      callbackUrl,
      body,
    );

    if (!isValid) {
      throw new HttpException(
        'Invalid Twilio signature.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.schedulerService.handleVoiceCallStatus({
      callSid,
      callStatus,
    });

    return {
      received: true,
    };
  }
}
