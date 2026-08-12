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

import { VoiceCallSettingsService } from './voice-call-settings.service';
import { CreateVoiceCallSettingDto } from './dto/create-voice-call-setting.dto';
import { UpdateVoiceCallSettingDto } from './dto/update-voice-call-setting.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('voice-call-settings')
@UseGuards(JwtAuthGuard)
export class VoiceCallSettingsController {
  constructor(
    private readonly voiceCallSettingsService: VoiceCallSettingsService,
  ) {}

  @Post()
  create(@Body() dto: CreateVoiceCallSettingDto) {
    return this.voiceCallSettingsService.create(dto);
  }

  @Get()
  findAll() {
    return this.voiceCallSettingsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.voiceCallSettingsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVoiceCallSettingDto,
  ) {
    return this.voiceCallSettingsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.voiceCallSettingsService.remove(id);
  }
}
