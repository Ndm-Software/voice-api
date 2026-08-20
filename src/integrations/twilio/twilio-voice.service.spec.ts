import { ConfigService } from '@nestjs/config';

import { RedisService } from '../redis/redis.service';
import type {
  TwilioVoiceCallResource,
  TwilioVoiceClient,
} from './twilio-voice-client.interface';
import {
  TWILIO_VOICE_MEDIA_KEY_PREFIX,
  TWILIO_VOICE_MEDIA_TTL_SECONDS,
} from './twilio-voice.constants';
import {
  InvalidTwilioVoiceCallError,
  TwilioVoiceCallError,
} from './twilio-voice.errors';
import { TwilioVoiceService } from './twilio-voice.service';

describe('TwilioVoiceService', () => {
  let callsCreate: jest.Mock<
    Promise<TwilioVoiceCallResource>,
    [Parameters<TwilioVoiceClient['calls']['create']>[0]]
  >;
  let redisService: jest.Mocked<Pick<RedisService, 'get' | 'setWithExpiry'>>;
  let service: TwilioVoiceService;

  beforeEach(() => {
    callsCreate = jest.fn<
      Promise<TwilioVoiceCallResource>,
      [Parameters<TwilioVoiceClient['calls']['create']>[0]]
    >();
    callsCreate.mockResolvedValue({
      sid: `CA${'1'.repeat(32)}`,
      status: 'queued',
    });
    redisService = {
      get: jest.fn().mockResolvedValue(null),
      setWithExpiry: jest.fn().mockResolvedValue(undefined),
    };

    service = new TwilioVoiceService(
      {
        calls: {
          create: callsCreate,
        },
      },
      new ConfigService({
        twilio: {
          phoneNumber: '+12025550123',
          voiceMediaBaseUrl: 'https://api.example.com/api/voice-call/media/',
        },
      }),
      redisService as unknown as RedisService,
    );
  });

  it('stores Polly audio temporarily and starts a call with inline Play TwiML', async () => {
    const audio = Buffer.from('polly-audio');

    await expect(service.startCall('+905551112233', audio)).resolves.toEqual({
      callSid: `CA${'1'.repeat(32)}`,
      status: 'queued',
    });

    expect(redisService.setWithExpiry).toHaveBeenCalledTimes(1);
    const [mediaKey, encodedAudio, ttlSeconds] =
      redisService.setWithExpiry.mock.calls[0];
    const mediaToken = mediaKey.slice(TWILIO_VOICE_MEDIA_KEY_PREFIX.length);

    expect(mediaKey).toMatch(/^twilio:voice-media:[A-Za-z0-9_-]{43}$/);
    expect(encodedAudio).toBe(audio.toString('base64'));
    expect(ttlSeconds).toBe(TWILIO_VOICE_MEDIA_TTL_SECONDS);
    const [callInput] = callsCreate.mock.calls[0];
    expect(callInput.to).toBe('+905551112233');
    expect(callInput.from).toBe('+12025550123');
    expect(callInput.twiml).toContain(
      `<Play>https://api.example.com/api/voice-call/media/${mediaToken}</Play>`,
    );
  });

  it.each([
    ['05551112233', Buffer.from('audio')],
    ['+905551112233', Buffer.alloc(0)],
  ])('rejects an invalid call input', async (phoneNumber, audio) => {
    await expect(service.startCall(phoneNumber, audio)).rejects.toBeInstanceOf(
      InvalidTwilioVoiceCallError,
    );

    expect(redisService.setWithExpiry).not.toHaveBeenCalled();
    expect(callsCreate).not.toHaveBeenCalled();
  });

  it('keeps TTL-protected media and maps provider failures to a safe error', async () => {
    callsCreate.mockRejectedValueOnce(new Error('provider secret detail'));

    await expect(
      service.startCall('+905551112233', Buffer.from('audio')),
    ).rejects.toEqual(new TwilioVoiceCallError());
    expect(redisService.setWithExpiry).toHaveBeenCalledTimes(1);
  });

  it('does not query Redis for malformed media tokens', async () => {
    await expect(service.getVoiceMedia('invalid')).resolves.toBeNull();

    expect(redisService.get).not.toHaveBeenCalled();
  });

  it('returns stored audio for a valid unexpired media token', async () => {
    const token = 'a'.repeat(43);
    const audio = Buffer.from('stored-polly-audio');
    redisService.get.mockResolvedValueOnce(audio.toString('base64'));

    await expect(service.getVoiceMedia(token)).resolves.toEqual(audio);
    expect(redisService.get).toHaveBeenCalledWith(
      `${TWILIO_VOICE_MEDIA_KEY_PREFIX}${token}`,
    );
  });
});
