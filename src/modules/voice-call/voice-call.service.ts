import { Injectable } from '@nestjs/common';

import type { SynthesizedSpeech } from '../../integrations/polly/polly.types';
import {
  TwilioVoiceCallResult,
  TwilioVoiceService,
} from '../../integrations/twilio/twilio-voice.service';

@Injectable()
export class VoiceCallService {
  constructor(private readonly twilioVoiceService: TwilioVoiceService) {}

  makeCall(
    to: string,
    speech: SynthesizedSpeech,
  ): Promise<TwilioVoiceCallResult> {
    return this.twilioVoiceService.startCall(to, speech.audio);
  }

  getVoiceMedia(token: string): Promise<Buffer | null> {
    return this.twilioVoiceService.getVoiceMedia(token);
  }
}
