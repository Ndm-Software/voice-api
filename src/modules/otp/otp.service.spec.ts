import { ServiceUnavailableException } from '@nestjs/common';

import { OtpProvider } from './contracts/otp-provider.interface';
import { OtpProviderUnavailableError } from './errors/otp-provider-unavailable.error';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  let provider: jest.Mocked<OtpProvider>;
  let service: OtpService;

  beforeEach(() => {
    provider = {
      requestCode: jest.fn(),
      verifyCode: jest.fn(),
    };
    service = new OtpService(provider);
  });

  it('delegates code requests to the active provider', async () => {
    provider.requestCode.mockResolvedValue();

    await expect(service.requestCode('+905551112233')).resolves.toBeUndefined();
    expect(provider.requestCode.mock.calls).toEqual([['+905551112233']]);
  });

  it('delegates verification without exposing provider details', async () => {
    provider.verifyCode.mockResolvedValue(true);

    await expect(service.verifyCode('+905551112233', '123456')).resolves.toBe(
      true,
    );
  });

  it.each(['requestCode', 'verifyCode'] as const)(
    'maps %s provider outages to a stable application error',
    async (methodName) => {
      provider[methodName].mockRejectedValue(new OtpProviderUnavailableError());

      const operation =
        methodName === 'requestCode'
          ? service.requestCode('+905551112233')
          : service.verifyCode('+905551112233', '123456');

      await expect(operation).rejects.toEqual(
        new ServiceUnavailableException({
          statusCode: 503,
          code: 'OTP_PROVIDER_UNAVAILABLE',
          message: 'Doğrulama servisi şu anda kullanılamıyor.',
        }),
      );
    },
  );

  it('does not hide unexpected programming errors', async () => {
    const error = new Error('unexpected');
    provider.requestCode.mockRejectedValue(error);

    await expect(service.requestCode('+905551112233')).rejects.toBe(error);
  });
});
