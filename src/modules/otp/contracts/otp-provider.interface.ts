export const OTP_PROVIDER = Symbol('OTP_PROVIDER');

export interface OtpProvider {
  requestCode(phoneNumber: string): Promise<void>;
  verifyCode(phoneNumber: string, code: string): Promise<boolean>;
}
