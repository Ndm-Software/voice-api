import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { SchedulerModule } from '../../scheduler/scheduler.module';
import { TimezoneModule } from '../timezone/timezone.module';

@Module({
  imports: [PrismaModule, SchedulerModule, TimezoneModule],
  controllers: [RemindersController],
  providers: [RemindersService],
  
})
export class RemindersModule {}
