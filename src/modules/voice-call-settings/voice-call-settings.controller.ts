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

import { VoiceCallSettingsService } from './voice-call-settings.service';
import { CreateVoiceCallSettingDto } from './dto/create-voice-call-setting.dto';
import { UpdateVoiceCallSettingDto } from './dto/update-voice-call-setting.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('voice-call-settings')
@UseGuards(JwtAuthGuard)
export class VoiceCallSettingsController {
  constructor(
    private readonly voiceCallSettingsService: VoiceCallSettingsService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateVoiceCallSettingDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.voiceCallSettingsService.create(dto, userId);
  }

  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.voiceCallSettingsService.findAll(userId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.voiceCallSettingsService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVoiceCallSettingDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.voiceCallSettingsService.update(id, dto, userId);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.voiceCallSettingsService.remove(id, userId);
  }
}
