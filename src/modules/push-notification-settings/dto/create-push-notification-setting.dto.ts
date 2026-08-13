import { IsInt, IsUUID, Min } from 'class-validator';

export class CreatePushNotificationSettingDto {
  @IsUUID()
  reminderId: string;

  @IsInt()
  @Min(0)
  minutesBefore: number;
}
