import { forwardRef, Module } from '@nestjs/common';
import { SchedulerModule } from '../../scheduler/scheduler.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { LanguagesModule } from '../languages/languages.module';
import { UserSettingsController } from './user-settings.controller';
import { UserSettingsService } from './user-settings.service';

@Module({
  imports: [PrismaModule, LanguagesModule, forwardRef(() => SchedulerModule)],
  controllers: [UserSettingsController],
  providers: [UserSettingsService],
  exports: [UserSettingsService],
})
export class UserSettingsModule {}
