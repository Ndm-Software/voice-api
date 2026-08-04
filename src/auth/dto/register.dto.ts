import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^[0-9]{10,11}$/, {
    message: 'Phone number must contain only digits.',
  })
  phoneNumber: string;

  @IsString()
  @MinLength(8)
  password: string;
}
