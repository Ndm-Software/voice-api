import { validateEnvironment } from './env.validation';

const validEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://postgres:password@localhost:5432/voice',
  FRONTEND_URL: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'access-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_SECRET: 'refresh-secret',
  JWT_REFRESH_EXPIRES_IN: '7d',
  REDIS_URL: 'redis://localhost:6379',
  OTP_PENDING_REGISTRATION_TTL_SECONDS: '600',
  OTP_RESEND_COOLDOWN_SECONDS: '60',
  OTP_MAX_VERIFY_ATTEMPTS: '5',
  OTP_RATE_LIMIT_WINDOW_SECONDS: '3600',
  OTP_PHONE_SEND_LIMIT: '5',
  OTP_IP_SEND_LIMIT: '20',
  OTP_PROVIDER: 'fake',
  OTP_FAKE_CODE: '654321',
  TWILIO_ACCOUNT_SID: `AC${'0'.repeat(32)}`,
  TWILIO_AUTH_TOKEN: 'twilio-auth-token',
  TWILIO_PHONE_NUMBER: '+10000000000',
  TWIML_BIN_URL:
    'https://handler.twilio.com/twiml/EH00000000000000000000000000000000',
};

describe('validateEnvironment', () => {
  it('normalizes valid values and applies the default port', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      REDIS_URL: ' redis://localhost:6379 ',
    });

    expect(result.REDIS_URL).toBe('redis://localhost:6379');
    expect(result.REDIS_HOST).toBe('localhost');
    expect(result.REDIS_PORT).toBe(6379);
    expect(result.OTP_PENDING_REGISTRATION_TTL_SECONDS).toBe(600);
    expect(result.PORT).toBe(3001);
    expect(result.TRUST_PROXY_HOPS).toBe(0);
    expect(result.OTP_PROVIDER).toBe('fake');
    expect(result.OTP_FAKE_CODE).toBe('654321');
    expect(result.NODE_ENV).toBe('development');
  });

  it('converts a valid port to a number', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      PORT: '4000',
    });

    expect(result.PORT).toBe(4000);
  });

  it('reports missing variables without exposing configured secrets', () => {
    const input = {
      ...validEnvironment,
      JWT_ACCESS_SECRET: 'secret-that-must-not-appear',
    };
    delete (input as Partial<typeof input>).TWILIO_AUTH_TOKEN;

    expect(() => validateEnvironment(input)).toThrow(
      'TWILIO_AUTH_TOKEN is required',
    );

    try {
      validateEnvironment(input);
    } catch (error) {
      expect((error as Error).message).not.toContain(
        'secret-that-must-not-appear',
      );
    }
  });

  it.each([
    ['PORT', '0', 'PORT must be an integer between 1 and 65535'],
    [
      'TRUST_PROXY_HOPS',
      '-1',
      'TRUST_PROXY_HOPS must be an integer between 0 and 10',
    ],
    [
      'DATABASE_URL',
      'mysql://localhost/voice',
      'DATABASE_URL must be a PostgreSQL URL',
    ],
    [
      'FRONTEND_URL',
      'file:///frontend',
      'FRONTEND_URL must be an HTTP or HTTPS URL',
    ],
    ['REDIS_URL', 'http://localhost:6379', 'REDIS_URL must be a Redis URL'],
    [
      'REDIS_PORT',
      '70000',
      'REDIS_PORT must be an integer between 1 and 65535',
    ],
    [
      'JWT_ACCESS_EXPIRES_IN',
      '15 minutes',
      'JWT_ACCESS_EXPIRES_IN must use s, m, h, or d units',
    ],
    [
      'TWILIO_ACCOUNT_SID',
      'invalid',
      'TWILIO_ACCOUNT_SID has an invalid format',
    ],
    [
      'TWILIO_PHONE_NUMBER',
      '05551112233',
      'TWILIO_PHONE_NUMBER must use E.164 format',
    ],
    [
      'TWIML_BIN_URL',
      'http://handler.twilio.com/twiml/test',
      'TWIML_BIN_URL must be an HTTPS URL',
    ],
    [
      'OTP_MAX_VERIFY_ATTEMPTS',
      '0',
      'OTP_MAX_VERIFY_ATTEMPTS must be a positive integer',
    ],
  ])('rejects an invalid %s value', (key, value, expectedMessage) => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        [key]: value,
      }),
    ).toThrow(expectedMessage);
  });

  it('rejects a resend cooldown longer than the pending registration lifetime', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        OTP_PENDING_REGISTRATION_TTL_SECONDS: '60',
        OTP_RESEND_COOLDOWN_SECONDS: '61',
      }),
    ).toThrow(
      'OTP_RESEND_COOLDOWN_SECONDS must not exceed OTP_PENDING_REGISTRATION_TTL_SECONDS',
    );
  });

  it('normalizes explicit scheduler Redis connection values', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      REDIS_HOST: ' redis ',
      REDIS_PORT: '6380',
    });

    expect(result.REDIS_HOST).toBe('redis');
    expect(result.REDIS_PORT).toBe(6380);
  });

  it('uses safe fake-provider defaults outside production', () => {
    const input: Record<string, unknown> = { ...validEnvironment };
    delete input.OTP_PROVIDER;
    delete input.OTP_FAKE_CODE;

    const result = validateEnvironment(input);

    expect(result.OTP_PROVIDER).toBe('fake');
    expect(result.OTP_FAKE_CODE).toBe('123456');
  });

  it('rejects an unsupported OTP provider', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        OTP_PROVIDER: 'unsupported',
      }),
    ).toThrow('OTP_PROVIDER must be one of: fake, twilio');
  });

  it('rejects an invalid fake OTP code', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        OTP_FAKE_CODE: '12345',
      }),
    ).toThrow('OTP_FAKE_CODE must contain exactly 6 digits');
  });

  it('rejects the fake provider in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: ' Production ',
      }),
    ).toThrow('OTP_PROVIDER=fake is allowed only in development or test');
  });

  it.each(['prod', 'staging', 'qa'])(
    'rejects the unsupported %s environment',
    (nodeEnvironment) => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          NODE_ENV: nodeEnvironment,
        }),
      ).toThrow('NODE_ENV must be one of: development, test, production');
    },
  );

  it('rejects a missing environment name', () => {
    const input: Record<string, unknown> = { ...validEnvironment };
    delete input.NODE_ENV;

    expect(() => validateEnvironment(input)).toThrow('NODE_ENV is required');
  });

  it('accepts the fake provider in test', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      NODE_ENV: 'test',
    });

    expect(result.NODE_ENV).toBe('test');
    expect(result.OTP_PROVIDER).toBe('fake');
  });

  it('normalizes the OTP provider name', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      OTP_PROVIDER: ' Twilio ',
      TWILIO_VERIFY_SERVICE_SID: `VA${'0'.repeat(32)}`,
    });

    expect(result.OTP_PROVIDER).toBe('twilio');
  });

  it('requires Twilio Verify configuration only for the Twilio provider', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        OTP_PROVIDER: 'twilio',
      }),
    ).toThrow('TWILIO_VERIFY_SERVICE_SID is required');
  });

  it('rejects an invalid Twilio Verify service identifier', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        OTP_PROVIDER: 'twilio',
        TWILIO_VERIFY_SERVICE_SID: 'invalid',
      }),
    ).toThrow('TWILIO_VERIFY_SERVICE_SID has an invalid format');
  });

  it('accepts valid Twilio Verify configuration for deferred activation', () => {
    const result = validateEnvironment({
      ...validEnvironment,
      OTP_PROVIDER: 'twilio',
      TWILIO_VERIFY_SERVICE_SID: `VA${'0'.repeat(32)}`,
    });

    expect(result.OTP_PROVIDER).toBe('twilio');
  });
});
