import type {
  Engine,
  LanguageCode,
  OutputFormat,
  VoiceId,
} from '@aws-sdk/client-polly';

export type SupportedPollyLanguage = 'TR' | 'EN';

export interface PollyVoiceConfiguration {
  readonly languageCode: SupportedPollyLanguage;
  readonly providerLanguageCode: LanguageCode;
  readonly voiceId: VoiceId;
  readonly engine: Engine;
  readonly outputFormat: OutputFormat;
  readonly sampleRate: '8000';
}

export interface SynthesizeSpeechInput {
  readonly text: string;
  readonly languageCode: string;
}

export interface SynthesizedSpeech {
  readonly audio: Buffer;
  readonly contentType: 'audio/mpeg';
  readonly format: 'mp3';
}
