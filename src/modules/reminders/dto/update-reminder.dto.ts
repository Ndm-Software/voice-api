import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';

import { ReminderStatus } from '../../../generated/prisma/enums';

import { CreateReminderDto } from './create-reminder.dto';

export class UpdateReminderDto extends PartialType(CreateReminderDto) {
  @IsOptional()
  @IsEnum(ReminderStatus)
  status?: ReminderStatus;
}
