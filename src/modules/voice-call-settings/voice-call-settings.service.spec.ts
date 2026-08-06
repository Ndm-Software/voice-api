import { Test, TestingModule } from '@nestjs/testing';
import { VoiceCallSettingsService } from './voice-call-settings.service';

describe('VoiceCallSettingsService', () => {
  let service: VoiceCallSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VoiceCallSettingsService],
    }).compile();

    service = module.get<VoiceCallSettingsService>(VoiceCallSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
