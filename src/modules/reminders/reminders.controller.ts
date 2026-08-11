import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { RemindersService } from './reminders.service';

import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Controller('reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReminderDto,
  ) {
    return this.remindersService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.remindersService.findAll(user.userId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) reminderId: number,
  ) {
    return this.remindersService.findOne(user.userId, reminderId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) reminderId: number,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.remindersService.update(user.userId, reminderId, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) reminderId: number,
  ) {
    return this.remindersService.remove(user.userId, reminderId);
  }
}
