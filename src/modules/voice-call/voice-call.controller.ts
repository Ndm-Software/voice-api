import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';

import { Public } from '../../common/decorators/public.decorator';
import { VoiceCallService } from './voice-call.service';

@Controller('voice-call')
export class VoiceCallController {
  constructor(private readonly voiceCallService: VoiceCallService) {}

  @Public()
  @Get('media/:token')
  async getVoiceMedia(
    @Param('token') token: string,
    @Res() response: Response,
  ): Promise<void> {
    const audio = await this.voiceCallService.getVoiceMedia(token);

    if (!audio) {
      response.status(404).end();
      return;
    }

    response
      .status(200)
      .set({
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Length': String(audio.byteLength),
        'Content-Type': 'audio/mpeg',
      })
      .send(audio);
  }
}
