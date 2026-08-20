import { Inject, Injectable } from '@nestjs/common';
import {
  PollyClient,
  SynthesizeSpeechCommand,
  TextType,
} from '@aws-sdk/client-polly';

import {
  POLLY_AUDIO_CONTENT_TYPE,
  POLLY_CLIENT,
  POLLY_MAX_TEXT_LENGTH,
  POLLY_REQUEST_TIMEOUT_MS,
} from './polly.constants';
import { InvalidPollyTextError, PollySynthesisError } from './polly.errors';
import { resolvePollyVoiceConfiguration } from './polly-voice-configuration';
import type { SynthesizeSpeechInput, SynthesizedSpeech } from './polly.types';

interface DestroyableAudioStream {
  destroy(): void;
}

const isDestroyableAudioStream = (
  audioStream: unknown,
): audioStream is DestroyableAudioStream =>
  typeof audioStream === 'object' &&
  audioStream !== null &&
  'destroy' in audioStream &&
  typeof audioStream.destroy === 'function';

@Injectable()
export class PollyService {
  constructor(@Inject(POLLY_CLIENT) private readonly client: PollyClient) {}

  async synthesize(input: SynthesizeSpeechInput): Promise<SynthesizedSpeech> {
    const text = this.normalizeText(input.text);
    const voiceConfiguration = resolvePollyVoiceConfiguration(
      input.languageCode,
    );
    const command = new SynthesizeSpeechCommand({
      Engine: voiceConfiguration.engine,
      LanguageCode: voiceConfiguration.providerLanguageCode,
      OutputFormat: voiceConfiguration.outputFormat,
      SampleRate: voiceConfiguration.sampleRate,
      Text: text,
      TextType: TextType.TEXT,
      VoiceId: voiceConfiguration.voiceId,
    });

    try {
      const response = await this.client.send(command, {
        abortSignal: AbortSignal.timeout(POLLY_REQUEST_TIMEOUT_MS),
      });

      const audioStream = response.AudioStream;

      if (!audioStream) {
        throw new PollySynthesisError();
      }

      if (response.ContentType !== POLLY_AUDIO_CONTENT_TYPE) {
        this.destroyAudioStream(audioStream);
        throw new PollySynthesisError();
      }

      let audioBytes: Uint8Array;

      try {
        audioBytes = await audioStream.transformToByteArray();
      } catch {
        this.destroyAudioStream(audioStream);
        throw new PollySynthesisError();
      }

      if (audioBytes.byteLength === 0) {
        throw new PollySynthesisError();
      }

      return {
        audio: Buffer.from(audioBytes),
        contentType: POLLY_AUDIO_CONTENT_TYPE,
        format: 'mp3',
      };
    } catch (error: unknown) {
      if (error instanceof PollySynthesisError) {
        throw error;
      }

      throw new PollySynthesisError();
    }
  }

  private normalizeText(text: string): string {
    const normalizedText = text.trim();

    if (
      normalizedText.length === 0 ||
      this.exceedsMaximumTextLength(normalizedText)
    ) {
      throw new InvalidPollyTextError();
    }

    return normalizedText;
  }

  private exceedsMaximumTextLength(text: string): boolean {
    const characters = text[Symbol.iterator]();
    let characterCount = 0;

    while (!characters.next().done) {
      characterCount += 1;

      if (characterCount > POLLY_MAX_TEXT_LENGTH) {
        return true;
      }
    }

    return false;
  }

  private destroyAudioStream(audioStream: unknown): void {
    if (isDestroyableAudioStream(audioStream)) {
      audioStream.destroy();
    }
  }
}
