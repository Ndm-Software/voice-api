import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DevicesModule } from './modules/devices/devices.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { VoiceCallSettingsModule } from './modules/voice-call-settings/voice-call-settings.module';
import { LanguagesModule } from './modules/languages/languages.module';
import { UserSettingsModule } from './modules/user-settings/user-settings.module';

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
    UserSettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
