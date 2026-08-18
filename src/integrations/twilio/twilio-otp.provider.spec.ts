import { ConfigService } from '@nestjs/config';

import { OtpProviderUnavailableError } from '../../modules/otp/errors/otp-provider-unavailable.error';
import { TwilioOtpProvider } from './twilio-otp.provider';
import {
  TwilioVerifyClient,
  TwilioVerifyService,
} from './twilio-verify-client.interface';

describe('TwilioOtpProvider', () => {
  const phoneNumber = '+905551112233';
  const verifyServiceSid = `VA${'1'.repeat(32)}`;
  let createVerification: jest.MockedFunction<
    TwilioVerifyService['verifications']['create']
  >;
  let createVerificationCheck: jest.MockedFunction<
    TwilioVerifyService['verificationChecks']['create']
  >;
  let services: jest.MockedFunction<
    TwilioVerifyClient['verify']['v2']['services']
  >;
  let provider: TwilioOtpProvider;

  beforeEach(() => {
    createVerification =
      jest.fn<TwilioVerifyService['verifications']['create']>();
    createVerificationCheck =
      jest.fn<TwilioVerifyService['verificationChecks']['create']>();
    services = jest
      .fn<TwilioVerifyClient['verify']['v2']['services']>()
      .mockReturnValue({
        verifications: { create: createVerification },
        verificationChecks: { create: createVerificationCheck },
      });

    const client: TwilioVerifyClient = {
      verify: { v2: { services } },
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(verifyServiceSid),
    } as unknown as ConfigService;

    provider = new TwilioOtpProvider(client, configService);
  });

  it('requests an SMS verification without returning provider data', async () => {
    createVerification.mockResolvedValue({ status: 'pending' });

    await expect(provider.requestCode(phoneNumber)).resolves.toBeUndefined();
    expect(services).toHaveBeenCalledWith(verifyServiceSid);
    expect(createVerification).toHaveBeenCalledWith({
      to: phoneNumber,
      channel: 'sms',
    });
  });

  it('approves only an approved verification status', async () => {
    createVerificationCheck.mockResolvedValue({ status: 'approved' });

    await expect(provider.verifyCode(phoneNumber, '123456')).resolves.toBe(
      true,
    );
    expect(createVerificationCheck).toHaveBeenCalledWith({
      to: phoneNumber,
      code: '123456',
    });
  });

  it('rejects a pending verification status', async () => {
    createVerificationCheck.mockResolvedValue({ status: 'pending' });

    await expect(provider.verifyCode(phoneNumber, '000000')).resolves.toBe(
      false,
    );
  });

  it.each([20404, 60202])(
    'treats terminal verification error %s as a rejected code',
    async (code) => {
      createVerificationCheck.mockRejectedValue({ code });

      await expect(provider.verifyCode(phoneNumber, '000000')).resolves.toBe(
        false,
      );
    },
  );

  it('maps send failures to a provider-neutral error', async () => {
    createVerification.mockRejectedValue(new Error('provider detail'));

    await expect(provider.requestCode(phoneNumber)).rejects.toBeInstanceOf(
      OtpProviderUnavailableError,
    );
  });

  it('maps unexpected verification failures to a provider-neutral error', async () => {
    createVerificationCheck.mockRejectedValue(new Error('provider detail'));

    await expect(provider.verifyCode(phoneNumber, '123456')).rejects.toEqual(
      new OtpProviderUnavailableError(),
    );
  });
});
