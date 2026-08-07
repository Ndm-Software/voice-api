import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateUserSettingsDto {
  @IsOptional()
  @IsInt({ message: 'Dil ID değeri tam sayı olmalıdır.' })
  @Min(1, { message: 'Geçerli bir dil seçilmelidir.' })
  languageId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @IsOptional()
  @IsBoolean({
    message: 'Bildirim tercihi true veya false olmalıdır.',
  })
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsInt({
    message: 'Push bildirim süresi tam sayı olmalıdır.',
  })
  @Min(0)
  @Max(10080)
  defaultPushBefore?: number;

  @IsOptional()
  @IsInt({
    message: 'Arama süresi tam sayı olmalıdır.',
  })
  @Min(0)
  @Max(10080)
  defaultCallBefore?: number;
}