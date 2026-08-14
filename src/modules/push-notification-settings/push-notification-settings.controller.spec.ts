import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationSettingsController } from './push-notification-settings.controller';

describe('PushNotificationSettingsController', () => {
  let controller: PushNotificationSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushNotificationSettingsController],
    }).compile();

    controller = module.get<PushNotificationSettingsController>(PushNotificationSettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
