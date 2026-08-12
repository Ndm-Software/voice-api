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
    },
  ) {
    // Sadece telefon numarasını gönderiyoruz
    return this.voiceCallService.makeCall(body.to);
  }
}
