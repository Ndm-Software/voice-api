import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

import { RedisService } from '../redis/redis.service';
import type { TwilioVoiceClient } from './twilio-voice-client.interface';
import {
  TWILIO_VOICE_CLIENT,
  TWILIO_VOICE_MEDIA_KEY_PREFIX,
  TWILIO_VOICE_MEDIA_TTL_SECONDS,
} from './twilio-voice.constants';
import {
  InvalidTwilioVoiceCallError,
  TwilioVoiceCallError,
} from './twilio-voice.errors';

const e164PhoneNumberPattern = /^\+[1-9]\d{7,14}$/;
const mediaTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export interface TwilioVoiceCallResult {
  readonly callSid: string;
  readonly status: string;
}

@Injectable()
export class TwilioVoiceService {
  constructor(
    @Inject(TWILIO_VOICE_CLIENT)
    private readonly client: TwilioVoiceClient,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async startCall(
    phoneNumber: string,
    audio: Buffer,
  ): Promise<TwilioVoiceCallResult> {
    if (!e164PhoneNumberPattern.test(phoneNumber) || audio.byteLength === 0) {
      throw new InvalidTwilioVoiceCallError();
    }

    const token = randomBytes(32).toString('base64url');
    try {
      await this.redisService.setWithExpiry(
        this.createMediaKey(token),
        audio.toString('base64'),
        TWILIO_VOICE_MEDIA_TTL_SECONDS,
      );

      const voiceResponse = new twilio.twiml.VoiceResponse();
      voiceResponse.play(this.createMediaUrl(token));

      const call = await this.client.calls.create({
        to: phoneNumber,
        from: this.configService.getOrThrow<string>('twilio.phoneNumber'),
        twiml: voiceResponse.toString(),
      });

      return {
        callSid: call.sid,
        status: call.status,
      };
    } catch (error: unknown) {
      if (error instanceof InvalidTwilioVoiceCallError) {
        throw error;
      }

      throw new TwilioVoiceCallError();
    }
  }

  async getVoiceMedia(token: string): Promise<Buffer | null> {
    if (!mediaTokenPattern.test(token)) {
      return null;
    }

    const encodedAudio = await this.redisService.get(
      this.createMediaKey(token),
    );

    if (!encodedAudio) {
      return null;
    }

    const audio = Buffer.from(encodedAudio, 'base64');

    return audio.byteLength > 0 ? audio : null;
  }

  private createMediaUrl(token: string): string {
    const baseUrl = this.configService
      .getOrThrow<string>('twilio.voiceMediaBaseUrl')
      .replace(/\/+$/, '');

    return `${baseUrl}/${token}`;
  }

  private createMediaKey(token: string): string {
    return `${TWILIO_VOICE_MEDIA_KEY_PREFIX}${token}`;
  }
}
