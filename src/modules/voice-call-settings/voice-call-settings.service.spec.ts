import { Test, TestingModule } from '@nestjs/testing';
import { VoiceCallSettingsService } from './voice-call-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('VoiceCallSettingsService', () => {
  let service: VoiceCallSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoiceCallSettingsService,
        {
          provide: PrismaService,
          useValue: {
            voiceCallSetting: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<VoiceCallSettingsService>(VoiceCallSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
