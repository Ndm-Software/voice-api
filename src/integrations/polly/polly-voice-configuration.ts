import { POLLY_VOICE_CONFIGURATIONS } from './polly.constants';
import { UnsupportedPollyLanguageError } from './polly.errors';
import type {
  PollyVoiceConfiguration,
  SupportedPollyLanguage,
} from './polly.types';

const isSupportedPollyLanguage = (
  languageCode: string,
): languageCode is SupportedPollyLanguage =>
  Object.hasOwn(POLLY_VOICE_CONFIGURATIONS, languageCode);

export const resolvePollyVoiceConfiguration = (
  languageCode: string,
): PollyVoiceConfiguration => {
  const normalizedLanguageCode = languageCode.trim().toUpperCase();

  if (!isSupportedPollyLanguage(normalizedLanguageCode)) {
    throw new UnsupportedPollyLanguageError();
  }

  return POLLY_VOICE_CONFIGURATIONS[normalizedLanguageCode];
};
