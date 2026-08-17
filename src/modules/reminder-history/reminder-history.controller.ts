import { Controller, Delete, Get, Param, Query } from '@nestjs/common';

import { ReminderHistoryService } from './reminder-history.service';

@Controller('reminder-history')
export class ReminderHistoryController {
  constructor(
    private readonly reminderHistoryService: ReminderHistoryService,
  ) {}

  @Get()
  findAll(@Query('reminderId') reminderId?: string) {
    return this.reminderHistoryService.findAll(reminderId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reminderHistoryService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reminderHistoryService.remove(id);
  }
}
