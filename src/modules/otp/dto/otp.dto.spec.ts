import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { VerifyPhoneOtpDto } from './phone-otp.dto';

describe('OTP workflow DTOs', () => {
  it('accepts normalized phone verification input', async () => {
    const dto = plainToInstance(VerifyPhoneOtpDto, {
      phoneNumber: ' +905551112233 ',
      code: ' 123456 ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.phoneNumber).toBe('+905551112233');
    expect(dto.code).toBe('123456');
  });

  it('rejects malformed phone numbers and codes', async () => {
    const dto = plainToInstance(VerifyPhoneOtpDto, {
      phoneNumber: '555',
      code: '12ab',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property).sort()).toEqual([
      'code',
      'phoneNumber',
    ]);
  });
});
