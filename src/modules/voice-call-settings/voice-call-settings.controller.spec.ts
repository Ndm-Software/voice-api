import { Test, TestingModule } from '@nestjs/testing';
import { VoiceCallSettingsController } from './voice-call-settings.controller';
import { VoiceCallSettingsService } from './voice-call-settings.service';

describe('VoiceCallSettingsController', () => {
  let controller: VoiceCallSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceCallSettingsController],
      providers: [
        {
          provide: VoiceCallSettingsService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<VoiceCallSettingsController>(
      VoiceCallSettingsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
