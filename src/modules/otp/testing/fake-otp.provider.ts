import { OtpProvider } from '../contracts/otp-provider.interface';

export class FakeOtpProvider implements OtpProvider {
  private readonly activeCodes = new Map<string, string>();

  constructor(private readonly generatedCode = '123456') {}

  requestCode(phoneNumber: string): Promise<void> {
    this.activeCodes.set(phoneNumber, this.generatedCode);

    return Promise.resolve();
  }

  verifyCode(phoneNumber: string, code: string): Promise<boolean> {
    const isApproved = this.activeCodes.get(phoneNumber) === code;

    if (isApproved) {
      this.activeCodes.delete(phoneNumber);
    }

    return Promise.resolve(isApproved);
  }
}
