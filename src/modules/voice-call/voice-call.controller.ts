import { Body, Controller, Post } from '@nestjs/common';
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
}
