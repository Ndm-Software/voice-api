import { Response } from 'express';

import { VoiceCallController } from './voice-call.controller';
import { VoiceCallService } from './voice-call.service';

describe('VoiceCallController', () => {
  const voiceCallService = {
    getVoiceMedia: jest.fn(),
  };
  const controller = new VoiceCallController(
    voiceCallService as unknown as VoiceCallService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves Polly MP3 bytes without allowing caches to retain them', async () => {
    const audio = Buffer.from('audio');
    const response = createResponse();
    voiceCallService.getVoiceMedia.mockResolvedValueOnce(audio);

    await controller.getVoiceMedia('token', response.value);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.set).toHaveBeenCalledWith({
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Length': String(audio.byteLength),
      'Content-Type': 'audio/mpeg',
    });
    expect(response.send).toHaveBeenCalledWith(audio);
  });

  it('returns an empty 404 response for missing or expired media', async () => {
    const response = createResponse();
    voiceCallService.getVoiceMedia.mockResolvedValueOnce(null);

    await controller.getVoiceMedia('token', response.value);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.end).toHaveBeenCalledTimes(1);
    expect(response.send).not.toHaveBeenCalled();
  });
});

const createResponse = () => {
  const status = jest.fn();
  const set = jest.fn();
  const send = jest.fn();
  const end = jest.fn();
  const value = {
    status,
    set,
    send,
    end,
  } as unknown as Response;

  status.mockReturnValue(value);
  set.mockReturnValue(value);
  send.mockReturnValue(value);
  end.mockReturnValue(value);

  return {
    value,
    status,
    set,
    send,
    end,
  };
};
