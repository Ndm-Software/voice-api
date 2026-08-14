import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { PushNotificationSettingsService } from './push-notification-settings.service';

import { CreatePushNotificationSettingDto } from './dto/create-push-notification-setting.dto';
import { UpdatePushNotificationSettingDto } from './dto/update-push-notification-setting.dto';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Controller('push-notification-settings')
@UseGuards(JwtAuthGuard)
export class PushNotificationSettingsController {
  constructor(
    private readonly pushNotificationSettingsService: PushNotificationSettingsService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePushNotificationSettingDto,
  ) {
    return this.pushNotificationSettingsService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.pushNotificationSettingsService.findAll(user.userId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') pushId: string) {
    return this.pushNotificationSettingsService.findOne(user.userId, pushId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') pushId: string,
    @Body() dto: UpdatePushNotificationSettingDto,
  ) {
    return this.pushNotificationSettingsService.update(
      user.userId,
      pushId,
      dto,
    );
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') pushId: string) {
    return this.pushNotificationSettingsService.remove(user.userId, pushId);
  }
}
