import { Transform, TransformFnParams } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export const trimString = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RegistrationPhoneDto {
  @IsString()
  @Matches(/^(?:\+[1-9]\d{7,14}|0?5\d{9})$/, {
    message: 'Phone number must be E.164 or a Turkish mobile number.',
  })
  @Transform(trimString)
  phoneNumber: string;
}
