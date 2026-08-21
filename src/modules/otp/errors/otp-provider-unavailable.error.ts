export class OtpProviderUnavailableError extends Error {
  constructor() {
    super('OTP provider is unavailable');
    this.name = OtpProviderUnavailableError.name;
  }
}
