import type { SynthesizedSpeech } from '../../integrations/polly/polly.types';
import { TwilioVoiceService } from '../../integrations/twilio/twilio-voice.service';
import { VoiceCallService } from './voice-call.service';

describe('VoiceCallService', () => {
  const twilioVoiceService = {
    getVoiceMedia: jest.fn(),
    startCall: jest.fn(),
  };
  const service = new VoiceCallService(
    twilioVoiceService as unknown as TwilioVoiceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes synthesized Polly audio to the Twilio integration', async () => {
    const speech: SynthesizedSpeech = {
      audio: Buffer.from('audio'),
      contentType: 'audio/mpeg',
      format: 'mp3',
    };
    twilioVoiceService.startCall.mockResolvedValueOnce({
      callSid: `CA${'1'.repeat(32)}`,
      status: 'queued',
    });

    await expect(service.makeCall('+905551112233', speech)).resolves.toEqual({
      callSid: `CA${'1'.repeat(32)}`,
      status: 'queued',
    });
    expect(twilioVoiceService.startCall).toHaveBeenCalledWith(
      '+905551112233',
      speech.audio,
    );
  });

  it('retrieves temporary voice media through the Twilio integration', async () => {
    const audio = Buffer.from('audio');
    twilioVoiceService.getVoiceMedia.mockResolvedValueOnce(audio);

    await expect(service.getVoiceMedia('token')).resolves.toBe(audio);
    expect(twilioVoiceService.getVoiceMedia).toHaveBeenCalledWith('token');
  });
});
