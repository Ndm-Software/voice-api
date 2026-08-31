import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { SilentHoursService } from './silent-hours.service';
import { CreateSilentHourDto } from './dto/create-silent-hour.dto/create-silent-hour.dto';
import { UpdateSilentHourDto } from './dto/update-silent-hour.dto/update-silent-hour.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Controller('silent-hours')
@UseGuards(JwtAuthGuard)
export class SilentHoursController {
  constructor(private readonly silentHoursService: SilentHoursService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSilentHourDto,
  ) {
    return this.silentHoursService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.silentHoursService.findAll(user.userId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) silentHourId: string,
  ) {
    return this.silentHoursService.findOne(user.userId, silentHourId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) silentHourId: string,
    @Body() dto: UpdateSilentHourDto,
  ) {
    return this.silentHoursService.update(user.userId, silentHourId, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) silentHourId: string,
  ) {
    return this.silentHoursService.remove(user.userId, silentHourId);
  }
}
