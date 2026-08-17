import { IsOptional, IsUUID } from 'class-validator';

export class FindReminderHistoryQueryDto {
  @IsOptional()
  @IsUUID('4')
  reminderId?: string;
}
