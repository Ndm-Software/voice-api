import { VoiceCallController } from './voice-call.controller';
import { VoiceCallService } from './voice-call.service';

describe('VoiceCallController', () => {
  type VoiceCallServiceMock = {
    makeCall: jest.Mock;
  };

  it('forwards test calls to the service', async () => {
    const service: VoiceCallServiceMock = {
      makeCall: jest.fn().mockResolvedValue({ success: true }),
    };
    const controller = new VoiceCallController(
      service as unknown as VoiceCallService,
    );

    await expect(
      controller.testCall({ to: '+905559998877', message: 'Reminder' }),
    ).resolves.toEqual({ success: true });
    expect(service.makeCall).toHaveBeenCalledWith('+905559998877', 'Reminder');
  });
});
