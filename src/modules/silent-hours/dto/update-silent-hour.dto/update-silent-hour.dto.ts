import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

import { DayOfWeek } from '../../../../generated/prisma/enums';

export class UpdateSilentHourDto {
  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'silentStart must be in HH:mm format',
  })
  silentStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'silentEnd must be in HH:mm format',
  })
  silentEnd?: string;
}
