import { Module } from '@nestjs/common';

import { PushNotificationSettingsController } from './push-notification-settings.controller';
import { PushNotificationSettingsService } from './push-notification-settings.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PushNotificationSettingsController],
  providers: [PushNotificationSettingsService],
  exports: [PushNotificationSettingsService],
})
export class PushNotificationSettingsModule {}
