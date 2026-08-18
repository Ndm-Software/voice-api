import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { OTP_PROVIDER, OtpProvider } from './contracts/otp-provider.interface';
import { OtpProviderUnavailableError } from './errors/otp-provider-unavailable.error';

@Injectable()
export class OtpService {
  constructor(@Inject(OTP_PROVIDER) private readonly provider: OtpProvider) {}

  async requestCode(phoneNumber: string): Promise<void> {
    try {
      await this.provider.requestCode(phoneNumber);
    } catch (error: unknown) {
      this.rethrowProviderError(error);
    }
  }

  async verifyCode(phoneNumber: string, code: string): Promise<boolean> {
    try {
      return await this.provider.verifyCode(phoneNumber, code);
    } catch (error: unknown) {
      this.rethrowProviderError(error);
    }
  }

  private rethrowProviderError(error: unknown): never {
    if (error instanceof OtpProviderUnavailableError) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'OTP_PROVIDER_UNAVAILABLE',
        message: 'Doğrulama servisi şu anda kullanılamıyor.',
      });
    }

    throw error;
  }
}
