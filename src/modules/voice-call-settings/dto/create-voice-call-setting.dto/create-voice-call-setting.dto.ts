export class CreateVoiceCallSettingDto {}
import { IsBoolean, IsInt } from 'class-validator';

export class CreateVoiceCallSettingDto {
  @IsInt()
  reminderId: number;

  @IsInt()
  minutesBefore: number;

  @IsBoolean()
  enabled: boolean;
}
