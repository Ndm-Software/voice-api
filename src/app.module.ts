import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { ApplicationConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
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
import { OtpModule } from './modules/otp/otp.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ReminderHistoryModule } from './modules/reminder-history/reminder-history.module';

@Module({
  imports: [
    ApplicationConfigModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    DevicesModule,
    VoiceCallSettingsModule,
    LanguagesModule,
    VoiceCallModule,
    UserSettingsModule,
    RemindersModule,
    ReminderHistoryModule,
    PushNotificationSettingsModule,
    OtpModule,
    SchedulerModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
