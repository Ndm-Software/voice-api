import {
  Engine,
  LanguageCode,
  OutputFormat,
  VoiceId,
} from '@aws-sdk/client-polly';

import { UnsupportedPollyLanguageError } from './polly.errors';
import { resolvePollyVoiceConfiguration } from './polly-voice-configuration';

describe('resolvePollyVoiceConfiguration', () => {
  it('resolves Turkish to the Burcu neural voice', () => {
    expect(resolvePollyVoiceConfiguration('TR')).toEqual({
      languageCode: 'TR',
      providerLanguageCode: LanguageCode.tr_TR,
      voiceId: VoiceId.Burcu,
      engine: Engine.NEURAL,
      outputFormat: OutputFormat.MP3,
      sampleRate: '8000',
    });
  });

  it('resolves English to the Joanna neural voice', () => {
    expect(resolvePollyVoiceConfiguration('EN')).toEqual({
      languageCode: 'EN',
      providerLanguageCode: LanguageCode.en_US,
      voiceId: VoiceId.Joanna,
      engine: Engine.NEURAL,
      outputFormat: OutputFormat.MP3,
      sampleRate: '8000',
    });
  });

  it('normalizes surrounding whitespace and letter casing', () => {
    expect(resolvePollyVoiceConfiguration(' tr ').languageCode).toBe('TR');
    expect(resolvePollyVoiceConfiguration(' en ').languageCode).toBe('EN');
  });

  it.each(['DE', 'FR', '', '  '])(
    'rejects the unsupported language %p',
    (languageCode) => {
      expect(() => resolvePollyVoiceConfiguration(languageCode)).toThrow(
        UnsupportedPollyLanguageError,
      );
    },
  );
});
