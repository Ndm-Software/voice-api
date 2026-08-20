import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { PollyModule } from '../integrations/polly/polly.module';
import { SchedulerService } from './scheduler.service';
import { PushNotificationModule } from '../modules/push-notification/push-notification.module';
import { PushNotificationProcessor } from './processors/push-notification.processor';
import { VoiceCallProcessor } from './processors/voice-call.processor';
import { VoiceCallModule } from '../modules/voice-call/voice-call.module';
import { QUEUE_NAMES } from './constants/queue.constants';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PollyModule,
    VoiceCallModule,
    PushNotificationModule,

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.getOrThrow<string>('REDIS_HOST'),
          port: Number(configService.getOrThrow<string>('REDIS_PORT')),
        },
      }),
    }),

    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.PUSH_NOTIFICATION,
      },
      {
        name: QUEUE_NAMES.VOICE_CALL,
      },
    ),
  ],

  providers: [SchedulerService, PushNotificationProcessor, VoiceCallProcessor],

  exports: [SchedulerService],
})
export class SchedulerModule {}
