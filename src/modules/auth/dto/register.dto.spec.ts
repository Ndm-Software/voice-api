import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  const validBody = {
    firstName: 'Test',
    lastName: 'User',
    email: 'user@example.com',
    phoneNumber: '+905551112233',
    password: 'password123',
  };

  const transform = (body: Record<string, unknown>) =>
    plainToInstance(RegisterDto, body, {
      enableImplicitConversion: false,
    });

  it.each(['+905551112233', '05551112233', '5551112233'])(
    'accepts supported phone format %s',
    async (phoneNumber) => {
      const errors = await validate(transform({ ...validBody, phoneNumber }));

      expect(errors).toHaveLength(0);
    },
  );

  it.each(['0555 111 22 33', '12345', '+0123456789', '905551112233'])(
    'rejects ambiguous phone format %s',
    async (phoneNumber) => {
      const errors = await validate(transform({ ...validBody, phoneNumber }));

      expect(errors.some((error) => error.property === 'phoneNumber')).toBe(
        true,
      );
    },
  );

  it('trims registration identity fields without altering the password', () => {
    const dto = transform({
      ...validBody,
      firstName: ' Test ',
      lastName: ' User ',
      email: ' user@example.com ',
      phoneNumber: ' +905551112233 ',
      password: ' password123 ',
    });

    expect(dto).toEqual({
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      phoneNumber: '+905551112233',
      password: ' password123 ',
    });
  });
});
