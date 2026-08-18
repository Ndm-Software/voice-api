import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationSettingsService } from './push-notification-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PushNotificationSettingsService', () => {
  let service: PushNotificationSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationSettingsService,
        {
          provide: PrismaService,
          useValue: {
            pushNotificationSetting: {
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

    service = module.get<PushNotificationSettingsService>(
      PushNotificationSettingsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
