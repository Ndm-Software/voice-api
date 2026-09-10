import { IsBoolean, IsInt, IsUUID, Min } from 'class-validator';

export class CreateVoiceCallSettingDto {
  @IsUUID()
  reminderId!: string;

  @IsInt()
  @Min(0)
  minutesBefore!: number;

  @IsBoolean()
  enabled!: boolean;
}
