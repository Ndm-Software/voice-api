import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { FindReminderHistoryQueryDto } from './dto/find-reminder-history.dto';
import { ReminderHistoryService } from './reminder-history.service';

@UseGuards(JwtAuthGuard)
@Controller('reminder-history')
export class ReminderHistoryController {
  constructor(
    private readonly reminderHistoryService: ReminderHistoryService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FindReminderHistoryQueryDto,
  ) {
    return this.reminderHistoryService.findAll(user.userId, query.reminderId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reminderHistoryService.findOne(user.userId, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reminderHistoryService.remove(user.userId, id);
  }
}
