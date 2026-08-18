import { FakeOtpProvider } from './fake-otp.provider';

describe('FakeOtpProvider', () => {
  const phoneNumber = '+905551112233';

  it('issues and approves the configured code', async () => {
    const provider = new FakeOtpProvider('654321');

    await provider.requestCode(phoneNumber);

    await expect(provider.verifyCode(phoneNumber, '654321')).resolves.toBe(
      true,
    );
  });

  it('rejects an invalid code', async () => {
    const provider = new FakeOtpProvider('654321');

    await provider.requestCode(phoneNumber);

    await expect(provider.verifyCode(phoneNumber, '000000')).resolves.toBe(
      false,
    );
  });

  it('allows an approved code to be used only once', async () => {
    const provider = new FakeOtpProvider('654321');

    await provider.requestCode(phoneNumber);
    await provider.verifyCode(phoneNumber, '654321');

    await expect(provider.verifyCode(phoneNumber, '654321')).resolves.toBe(
      false,
    );
  });
});
