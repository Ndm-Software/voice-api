import {
  Engine,
  LanguageCode,
  OutputFormat,
  VoiceId,
} from '@aws-sdk/client-polly';

import type {
  PollyVoiceConfiguration,
  SupportedPollyLanguage,
} from './polly.types';

export const POLLY_AUDIO_CONTENT_TYPE = 'audio/mpeg' as const;
export const POLLY_CLIENT = Symbol('POLLY_CLIENT');

export const POLLY_VOICE_CONFIGURATIONS: Readonly<
  Record<SupportedPollyLanguage, PollyVoiceConfiguration>
> = {
  TR: {
    languageCode: 'TR',
    providerLanguageCode: LanguageCode.tr_TR,
    voiceId: VoiceId.Burcu,
    engine: Engine.NEURAL,
    outputFormat: OutputFormat.MP3,
    sampleRate: '8000',
  },
  EN: {
    languageCode: 'EN',
    providerLanguageCode: LanguageCode.en_US,
    voiceId: VoiceId.Joanna,
    engine: Engine.NEURAL,
    outputFormat: OutputFormat.MP3,
    sampleRate: '8000',
  },
};
