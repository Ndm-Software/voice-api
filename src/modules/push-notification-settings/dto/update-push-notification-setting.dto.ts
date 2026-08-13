import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePushNotificationSettingDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  minutesBefore?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
