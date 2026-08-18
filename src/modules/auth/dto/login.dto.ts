import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  PlatformType,
  type PlatformType as PlatformTypeValue,
} from '../../../generated/prisma/enums';

const trimString = ({ value }: TransformFnParams): unknown => {
  const input: unknown = value;

  return typeof input === 'string' ? input.trim() : input;
};

const normalizeUuid = ({ value }: TransformFnParams): unknown => {
  const input: unknown = value;

  return typeof input === 'string' ? input.trim().toLowerCase() : input;
};

export class LoginDto {
  @Transform(trimString)
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @Transform(normalizeUuid)
  @IsUUID('4')
  installationId: string;

  @IsEnum(PlatformType)
  platform: PlatformTypeValue;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  deviceName: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  pushToken?: string | null;
}
