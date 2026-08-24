import { ConfigService } from '@nestjs/config';

import { VoiceCallService } from './voice-call.service';

const mockCreate = jest.fn();

jest.mock('twilio', () => {
  class VoiceResponse {
    private message = '';

    say(_options: unknown, message: string) {
      this.message = message;
    }

    toString() {
      return `<Response><Say>${this.message}</Say></Response>`;
    }
  }

  const mockTwilio = jest.fn(() => ({
    calls: {
      create: mockCreate,
    },
  }));

  return Object.assign(mockTwilio, {
    twiml: { VoiceResponse },
  });
});

describe('VoiceCallService', () => {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        TWILIO_ACCOUNT_SID: 'account-sid',
        TWILIO_AUTH_TOKEN: 'auth-token',
        TWILIO_PHONE_NUMBER: '+905551112233',
      };
      return values[key];
    }),
  };

  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('creates a Twilio call with the reminder message as inline TwiML', async () => {
    const reminderMessage = 'Reminder from the saved reminder';
    mockCreate.mockResolvedValue({ sid: 'call-sid', status: 'queued' });
    const service = new VoiceCallService(config as unknown as ConfigService);

    await expect(
      service.makeCall('+905559998877', reminderMessage),
    ).resolves.toEqual({
      success: true,
      callSid: 'call-sid',
      status: 'queued',
    });
    expect(mockCreate).toHaveBeenCalledWith({
      to: '+905559998877',
      from: '+905551112233',
      twiml: `<Response><Say>${reminderMessage}</Say></Response>`,
    });
  });

  it('returns Twilio errors without throwing', async () => {
    mockCreate.mockRejectedValue(new Error('Twilio unavailable'));
    const service = new VoiceCallService(config as unknown as ConfigService);

    await expect(
      service.makeCall('+905559998877', 'Reminder'),
    ).resolves.toEqual({
      success: false,
      error: 'Twilio unavailable',
    });
  });
});
