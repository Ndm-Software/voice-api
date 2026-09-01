import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';

import { UpdateUserDto } from './update-user.dto';

const metadata: ArgumentMetadata = {
  type: 'body',
  metatype: UpdateUserDto,
};

describe('UpdateUserDto', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const transform = async (
    body: Record<string, unknown>,
  ): Promise<UpdateUserDto> => {
    const result: unknown = await validationPipe.transform(body, metadata);

    return result as UpdateUserDto;
  };

  it('accepts the editable profile fields', async () => {
    await expect(
      transform({
        firstName: 'Yeni',
        lastName: 'Kullanıcı',
        email: 'new@example.com',
      }),
    ).resolves.toEqual({
      firstName: 'Yeni',
      lastName: 'Kullanıcı',
      email: 'new@example.com',
    });
  });

  it('rejects phone changes outside the OTP workflow', async () => {
    await expect(
      transform({ phoneNumber: '+905551112233' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
