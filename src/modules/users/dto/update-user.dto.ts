import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, {
    message: 'Ad en az 2 karakter olmalıdır.',
  })
  @MaxLength(50, {
    message: 'Ad en fazla 50 karakter olabilir.',
  })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, {
    message: 'Soyad en az 2 karakter olmalıdır.',
  })
  @MaxLength(50, {
    message: 'Soyad en fazla 50 karakter olabilir.',
  })
  lastName?: string;

  @IsOptional()
  @IsEmail(
    {},
    {
      message: 'Geçerli bir e-posta adresi giriniz.',
    },
  )
  email?: string;
}
