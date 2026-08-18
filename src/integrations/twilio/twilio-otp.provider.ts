import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OtpProvider } from '../../modules/otp/contracts/otp-provider.interface';
import { OtpProviderUnavailableError } from '../../modules/otp/errors/otp-provider-unavailable.error';
import { TwilioVerifyClient } from './twilio-verify-client.interface';

const terminalVerificationErrorCodes = new Set([20404, 60202]);

@Injectable()
export class TwilioOtpProvider implements OtpProvider {
  private readonly verifyServiceSid: string;

  constructor(
    private readonly client: TwilioVerifyClient,
    configService: ConfigService,
  ) {
    this.verifyServiceSid = configService.getOrThrow<string>(
      'twilio.verifyServiceSid',
    );
  }

  async requestCode(phoneNumber: string): Promise<void> {
    try {
      await this.getVerifyService().verifications.create({
        to: phoneNumber,
        channel: 'sms',
      });
    } catch {
      throw new OtpProviderUnavailableError();
    }
  }

  async verifyCode(phoneNumber: string, code: string): Promise<boolean> {
    try {
      const result = await this.getVerifyService().verificationChecks.create({
        to: phoneNumber,
        code,
      });

      return result.status === 'approved';
    } catch (error: unknown) {
      if (this.isTerminalVerificationError(error)) {
        return false;
      }

      throw new OtpProviderUnavailableError();
    }
  }

  private getVerifyService() {
    return this.client.verify.v2.services(this.verifyServiceSid);
  }

  private isTerminalVerificationError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }

    const code = (error as { code?: unknown }).code;

    return typeof code === 'number' && terminalVerificationErrorCodes.has(code);
  }
}
