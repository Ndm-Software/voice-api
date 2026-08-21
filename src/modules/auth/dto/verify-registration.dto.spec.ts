import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { VerifyRegistrationDto } from './verify-registration.dto';

describe('VerifyRegistrationDto', () => {
  const transform = (body: Record<string, unknown>) =>
    plainToInstance(VerifyRegistrationDto, body, {
      enableImplicitConversion: false,
    });

  it('accepts a normalized phone and numeric verification code', async () => {
    const dto = transform({
      phoneNumber: ' +905551112233 ',
      code: ' 123456 ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual({
      phoneNumber: '+905551112233',
      code: '123456',
    });
  });

  it.each(['123', '12345678901', '12A456', ''])(
    'rejects invalid verification code %s',
    async (code) => {
      const errors = await validate(
        transform({ phoneNumber: '+905551112233', code }),
      );

      expect(errors.some((error) => error.property === 'code')).toBe(true);
    },
  );
});
