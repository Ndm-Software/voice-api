import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

import { HistoryStatus, HistoryType } from '../../../generated/prisma/client';

export class CreateReminderHistoryDto {
  @IsUUID()
  reminderId!: string;

  @IsEnum(HistoryType)
  historyType!: HistoryType;

  @IsEnum(HistoryStatus)
  status!: HistoryStatus;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  attempt?: number;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
