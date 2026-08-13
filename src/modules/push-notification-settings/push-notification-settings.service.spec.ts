import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationSettingsService } from './push-notification-settings.service';

describe('PushNotificationSettingsService', () => {
  let service: PushNotificationSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PushNotificationSettingsService],
    }).compile();

    service = module.get<PushNotificationSettingsService>(PushNotificationSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
