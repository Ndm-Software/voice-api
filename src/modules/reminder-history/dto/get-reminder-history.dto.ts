import { IsOptional, IsUUID } from 'class-validator';

export class GetReminderHistoryDto {
  @IsOptional()
  @IsUUID('4', { message: 'reminderId geçerli bir UUID 4 değeri olmalıdır.' })
  reminderId?: string;
}
