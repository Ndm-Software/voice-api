import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

import { RegistrationPhoneDto, trimString } from './registration-phone.dto';

export class VerifyRegistrationDto extends RegistrationPhoneDto {
  @IsString()
  @Matches(/^\d{4,10}$/, {
    message: 'Verification code must contain 4 to 10 digits.',
  })
  @Transform(trimString)
  code: string;
}
