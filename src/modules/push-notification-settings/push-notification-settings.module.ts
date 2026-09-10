import { Module, forwardRef } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { SchedulerModule } from '../../scheduler/scheduler.module';

import { PushNotificationSettingsController } from './push-notification-settings.controller';
import { PushNotificationSettingsService } from './push-notification-settings.service';

@Module({
  imports: [PrismaModule, forwardRef(() => SchedulerModule)],
  controllers: [PushNotificationSettingsController],
  providers: [PushNotificationSettingsService],
  exports: [PushNotificationSettingsService],
})
export class PushNotificationSettingsModule {}
