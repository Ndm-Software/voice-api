import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { SilentHoursController } from './silent-hours.controller';
import { SilentHoursService } from './silent-hours.service';

@Module({
  imports: [PrismaModule],
  controllers: [SilentHoursController],
  providers: [SilentHoursService],
  exports: [SilentHoursService],
})
export class SilentHoursModule {}
