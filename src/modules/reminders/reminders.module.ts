import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { SchedulerModule } from '../../scheduler/scheduler.module';
import { TimezoneService } from '../../common/services/timezone.service';

@Module({
  imports: [PrismaModule, SchedulerModule],
  controllers: [RemindersController],
  providers: [RemindersService, TimezoneService],
  
})
export class RemindersModule {}
