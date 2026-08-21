import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

import { RegistrationPhoneDto, trimString } from './registration-phone.dto';

export class RegisterDto extends RegistrationPhoneDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  lastName: string;

  @IsEmail()
  @Transform(trimString)
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
