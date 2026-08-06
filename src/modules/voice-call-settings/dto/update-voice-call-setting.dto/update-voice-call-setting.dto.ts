export class UpdateVoiceCallSettingDto {}
import { PartialType } from '@nestjs/mapped-types';
import { CreateVoiceCallSettingDto } from './create-voice-call-setting.dto';

export class UpdateVoiceCallSettingDto extends PartialType(
  CreateVoiceCallSettingDto,
) {}
