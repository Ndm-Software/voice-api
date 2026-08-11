import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { RepeatType } from '../../../generated/prisma/enums';

export class CreateReminderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  eventDatetime: string;

  @IsEnum(RepeatType)
  repeatType: RepeatType;

  @IsDateString()
  @IsOptional()
  repeatUntil?: string;

  @IsBoolean()
  @IsOptional()
  isUrgent?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  pushMinutesBefore?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  voiceMinutesBefore?: number;
}
