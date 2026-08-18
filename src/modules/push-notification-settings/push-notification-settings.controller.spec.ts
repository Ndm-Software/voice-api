import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationSettingsController } from './push-notification-settings.controller';
import { PushNotificationSettingsService } from './push-notification-settings.service';

describe('PushNotificationSettingsController', () => {
  let controller: PushNotificationSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushNotificationSettingsController],
      providers: [
        {
          provide: PushNotificationSettingsService,
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

    controller = module.get<PushNotificationSettingsController>(
      PushNotificationSettingsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
