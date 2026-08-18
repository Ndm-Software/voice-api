import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { ReminderHistoryController } from './reminder-history.controller';
import { ReminderHistoryService } from './reminder-history.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReminderHistoryController],
  providers: [ReminderHistoryService],
  exports: [ReminderHistoryService],
})
export class ReminderHistoryModule {}
