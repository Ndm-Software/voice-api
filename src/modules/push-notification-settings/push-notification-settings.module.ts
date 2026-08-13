import { Module } from '@nestjs/common';

import { PushNotificationSettingsController } from './push-notification-settings.controller';
import { PushNotificationSettingsService } from './push-notification-settings.service';

@Module({
  controllers: [PushNotificationSettingsController],
  providers: [PushNotificationSettingsService],
  exports: [PushNotificationSettingsService],
})
export class PushNotificationSettingsModule {}
