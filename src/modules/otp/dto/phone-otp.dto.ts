import { Transform, TransformFnParams } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class PhoneOtpDto {
  @IsString()
  @Matches(/^(?:\+[1-9]\d{7,14}|0?5\d{9})$/, {
    message: 'Phone number must be E.164 or a Turkish mobile number.',
  })
  @Transform(trimString)
  phoneNumber: string;
}

export class VerifyPhoneOtpDto extends PhoneOtpDto {
  @IsString()
  @Matches(/^\d{4,10}$/, {
    message: 'Verification code must contain 4 to 10 digits.',
  })
  @Transform(trimString)
  code: string;
}
