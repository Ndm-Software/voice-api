import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';

import { DayOfWeek } from '../../../../generated/prisma/enums';

export class CreateSilentHourDto {
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'silentStart must be in HH:mm format',
  })
  silentStart!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'silentEnd must be in HH:mm format',
  })
  silentEnd!: string;
}
