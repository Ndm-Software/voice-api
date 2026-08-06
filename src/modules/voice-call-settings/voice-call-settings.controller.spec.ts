import { Test, TestingModule } from '@nestjs/testing';
import { VoiceCallSettingsController } from './voice-call-settings.controller';

describe('VoiceCallSettingsController', () => {
  let controller: VoiceCallSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceCallSettingsController],
    }).compile();

    controller = module.get<VoiceCallSettingsController>(VoiceCallSettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
