import { ConfigService } from '@nestjs/config';

import { TwilioOtpProviderFactory } from '../../integrations/twilio/twilio-otp-provider.factory';
import { OtpProvider } from './contracts/otp-provider.interface';
import { OtpProviderFactory } from './otp-provider.factory';
import { FakeOtpProvider } from './testing/fake-otp.provider';

describe('OtpProviderFactory', () => {
  const createFactory = (values: Record<string, string>) => {
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const value = values[key];

        if (value === undefined) {
          throw new Error(`Missing configuration: ${key}`);
        }

        return value;
      }),
    } as unknown as ConfigService;
    const twilioProvider: OtpProvider = {
      requestCode: jest.fn().mockResolvedValue(undefined),
      verifyCode: jest.fn().mockResolvedValue(true),
    };
    const createTwilioProvider = jest.fn().mockReturnValue(twilioProvider);
    const twilioProviderFactory = {
      create: createTwilioProvider,
    } as unknown as TwilioOtpProviderFactory;

    return {
      factory: new OtpProviderFactory(configService, twilioProviderFactory),
      createTwilioProvider,
      twilioProvider,
    };
  };

  it('creates the fake provider without initializing Twilio', async () => {
    const { factory, createTwilioProvider } = createFactory({
      'otp.provider': 'fake',
      'otp.fakeCode': '654321',
    });

    const provider = factory.create();

    expect(provider).toBeInstanceOf(FakeOtpProvider);
    expect(createTwilioProvider).not.toHaveBeenCalled();
    await provider.requestCode('+905551112233');
    await expect(provider.verifyCode('+905551112233', '654321')).resolves.toBe(
      true,
    );
  });

  it('creates the deferred Twilio provider only when selected', () => {
    const { factory, createTwilioProvider, twilioProvider } = createFactory({
      'otp.provider': 'twilio',
    });

    expect(factory.create()).toBe(twilioProvider);
    expect(createTwilioProvider).toHaveBeenCalledTimes(1);
  });

  it('rejects a provider name that escaped configuration validation', () => {
    const { factory } = createFactory({
      'otp.provider': 'unsupported',
    });

    expect(() => factory.create()).toThrow(
      'Unsupported OTP provider: unsupported',
    );
  });
});
