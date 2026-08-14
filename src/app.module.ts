import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { DevicesModule } from './modules/devices/devices.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { VoiceCallSettingsModule } from './modules/voice-call-settings/voice-call-settings.module';
import { LanguagesModule } from './modules/languages/languages.module';
import { UserSettingsModule } from './modules/user-settings/user-settings.module';
import { VoiceCallModule } from './modules/voice-call/voice-call.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { PushNotificationSettingsModule } from './modules/push-notification-settings/push-notification-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    DevicesModule,
    VoiceCallSettingsModule,
    LanguagesModule,
    VoiceCallModule,
    UserSettingsModule,
    RemindersModule,
    PushNotificationSettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
