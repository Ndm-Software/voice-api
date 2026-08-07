import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { LanguagesModule } from '../languages/languages.module';
import { UserSettingsController } from './user-settings.controller';
import { UserSettingsService } from './user-settings.service';

@Module({
  imports: [
    PrismaModule,
    LanguagesModule,
  ],
  controllers: [UserSettingsController],
  providers: [UserSettingsService],
  exports: [UserSettingsService],
})
export class UserSettingsModule {}