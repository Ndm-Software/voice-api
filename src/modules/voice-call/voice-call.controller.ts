import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import twilio from 'twilio';

import { VoiceCallService } from './voice-call.service';

@Controller('voice-call')
export class VoiceCallController {
  constructor(private readonly voiceCallService: VoiceCallService) {}

  @Post('test')
  async testCall(
    @Body()
    body: {
      to: string;
      message: string;
    },
  ) {
    return this.voiceCallService.makeCall(body.to, body.message);
  }

  @Get('twiml')
  twiml(@Query('message') message: string, @Res() res: Response) {
    const twiml = new twilio.twiml.VoiceResponse();

    twiml.say(
      {
        language: 'tr-TR',
        voice: 'alice',
      },
      message || 'Hatırlatıcınız var.',
    );

    res.type('text/xml');
    res.send(twiml.toString());
  }
}
