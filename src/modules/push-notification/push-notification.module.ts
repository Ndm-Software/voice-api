import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PushNotificationService } from './push-notification.service';

@Module({
  imports: [ConfigModule],

  providers: [
    PushNotificationService,
  ],

  exports: [
    PushNotificationService,
  ],
})
export class PushNotificationModule {}