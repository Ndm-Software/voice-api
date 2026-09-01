import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

import { TWILIO_VOICE_CLIENT } from './twilio-voice.constants';
import type { TwilioVoiceClient } from './twilio-voice-client.interface';

export const twilioVoiceClientProvider: Provider<TwilioVoiceClient> = {
  provide: TWILIO_VOICE_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): TwilioVoiceClient =>
    twilio(
      configService.getOrThrow<string>('twilio.accountSid'),
      configService.getOrThrow<string>('twilio.authToken'),
    ),
};
