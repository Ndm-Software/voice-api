import { IsBoolean, IsInt, IsUUID } from 'class-validator';

export class CreateVoiceCallSettingDto {
  @IsUUID()
  reminderId: string;

  @IsInt()
  minutesBefore: number;

  @IsBoolean()
  enabled: boolean;
}
