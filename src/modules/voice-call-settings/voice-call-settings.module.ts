import { Module, forwardRef } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { SchedulerModule } from '../../scheduler/scheduler.module';

import { VoiceCallSettingsController } from './voice-call-settings.controller';
import { VoiceCallSettingsService } from './voice-call-settings.service';

@Module({
  imports: [PrismaModule, forwardRef(() => SchedulerModule)],
  controllers: [VoiceCallSettingsController],
  providers: [VoiceCallSettingsService],
})
export class VoiceCallSettingsModule {}
