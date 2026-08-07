import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
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

const isDefined = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

export class RegisterDeviceDto {
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

  @ValidateIf(isDefined)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  pushToken?: string;
}
