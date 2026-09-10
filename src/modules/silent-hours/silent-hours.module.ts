import { forwardRef, Module } from '@nestjs/common';
import { SchedulerModule } from '../../scheduler/scheduler.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { SilentHoursController } from './silent-hours.controller';
import { SilentHoursService } from './silent-hours.service';

@Module({
  imports: [PrismaModule, forwardRef(() => SchedulerModule)],
  controllers: [SilentHoursController],
  providers: [SilentHoursService],
  exports: [SilentHoursService],
})
export class SilentHoursModule {}
