import {
  Engine,
  LanguageCode,
  OutputFormat,
  PollyClient,
  SynthesizeSpeechCommand,
  TextType,
  VoiceId,
} from '@aws-sdk/client-polly';
import type { SynthesizeSpeechCommandOutput } from '@aws-sdk/client-polly';

import {
  InvalidPollyTextError,
  PollySynthesisError,
  UnsupportedPollyLanguageError,
} from './polly.errors';
import { PollyService } from './polly.service';

const createAudioStream = (bytes: number[]) => ({
  transformToByteArray: jest.fn().mockResolvedValue(Uint8Array.from(bytes)),
  destroy: jest.fn(),
});

const createResponse = (
  bytes: number[] = [1, 2, 3],
): SynthesizeSpeechCommandOutput =>
  ({
    AudioStream: createAudioStream(bytes),
    ContentType: 'audio/mpeg',
    $metadata: {},
  }) as unknown as SynthesizeSpeechCommandOutput;

describe('PollyService', () => {
  let send: jest.Mock;
  let service: PollyService;

  beforeEach(() => {
    send = jest.fn();
    service = new PollyService({ send } as unknown as PollyClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('synthesizes trimmed Turkish text with the Burcu voice', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    send.mockResolvedValue(createResponse([10, 20, 30]));

    await expect(
      service.synthesize({ text: ' Hatırlatıcınız var. ', languageCode: 'tr' }),
    ).resolves.toEqual({
      audio: Buffer.from([10, 20, 30]),
      contentType: 'audio/mpeg',
      format: 'mp3',
    });

    const [command, options] = send.mock.calls[0] as [
      SynthesizeSpeechCommand,
      { abortSignal: AbortSignal },
    ];

    expect(command).toBeInstanceOf(SynthesizeSpeechCommand);
    expect(command.input).toEqual({
      Engine: Engine.NEURAL,
      LanguageCode: LanguageCode.tr_TR,
      OutputFormat: OutputFormat.MP3,
      SampleRate: '8000',
      Text: 'Hatırlatıcınız var.',
      TextType: TextType.TEXT,
      VoiceId: VoiceId.Burcu,
    });
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
  });

  it('uses the Joanna voice for English text', async () => {
    send.mockResolvedValue(createResponse());

    await service.synthesize({ text: 'Reminder.', languageCode: 'EN' });

    const [command] = send.mock.calls[0] as [SynthesizeSpeechCommand];

    expect(command.input.LanguageCode).toBe(LanguageCode.en_US);
    expect(command.input.VoiceId).toBe(VoiceId.Joanna);
  });

  it.each(['', '   ', 'a'.repeat(3001), '😀'.repeat(3001)])(
    'rejects invalid text before calling Polly',
    async (text) => {
      await expect(
        service.synthesize({ text, languageCode: 'TR' }),
      ).rejects.toBeInstanceOf(InvalidPollyTextError);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(['a'.repeat(3000), '😀'.repeat(3000)])(
    'accepts text at the 3000 Unicode character limit',
    async (text) => {
      send.mockResolvedValue(createResponse());

      await service.synthesize({
        text,
        languageCode: 'EN',
      });

      const [command] = send.mock.calls[0] as [SynthesizeSpeechCommand];

      expect(Array.from(command.input.Text ?? '')).toHaveLength(3000);
    },
  );

  it('rejects unsupported languages before calling Polly', async () => {
    await expect(
      service.synthesize({ text: 'Reminder.', languageCode: 'DE' }),
    ).rejects.toBeInstanceOf(UnsupportedPollyLanguageError);
    expect(send).not.toHaveBeenCalled();
  });

  it('maps SDK errors to a safe synthesis error', async () => {
    send.mockRejectedValue(new Error('AccessDenied: provider detail'));

    await expect(
      service.synthesize({ text: 'Reminder.', languageCode: 'EN' }),
    ).rejects.toEqual(new PollySynthesisError());
  });

  it.each([{ ContentType: 'audio/mpeg', $metadata: {} }, createResponse([])])(
    'rejects invalid Polly audio responses',
    async (response) => {
      send.mockResolvedValue(response);

      await expect(
        service.synthesize({ text: 'Reminder.', languageCode: 'EN' }),
      ).rejects.toBeInstanceOf(PollySynthesisError);
    },
  );

  it('destroys the stream when Polly returns an unexpected content type', async () => {
    const audioStream = createAudioStream([1, 2, 3]);
    send.mockResolvedValue({
      AudioStream: audioStream,
      ContentType: 'audio/ogg',
      $metadata: {},
    });

    await expect(
      service.synthesize({ text: 'Reminder.', languageCode: 'EN' }),
    ).rejects.toBeInstanceOf(PollySynthesisError);
    expect(audioStream.destroy).toHaveBeenCalledTimes(1);
  });

  it('maps audio stream failures to a safe synthesis error', async () => {
    const destroy = jest.fn();
    send.mockResolvedValue({
      ...createResponse(),
      AudioStream: {
        transformToByteArray: jest
          .fn()
          .mockRejectedValue(new Error('stream detail')),
        destroy,
      },
    });

    await expect(
      service.synthesize({ text: 'Reminder.', languageCode: 'TR' }),
    ).rejects.toEqual(new PollySynthesisError());
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
