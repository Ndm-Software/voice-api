import { configuration } from './configuration';

describe('configuration', () => {
  const managedVariables = [
    'NODE_ENV',
    'TWILIO_VOICE_MEDIA_BASE_URL',
    'REDIS_URL',
    'REDIS_HOST',
    'REDIS_PORT',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
  ] as const;
  const originalEnvironment = Object.fromEntries(
    managedVariables.map((variableName) => [
      variableName,
      process.env[variableName],
    ]),
  ) as Record<(typeof managedVariables)[number], string | undefined>;

  afterEach(() => {
    managedVariables.forEach((variableName) => {
      const originalValue = originalEnvironment[variableName];

      if (originalValue === undefined) {
        delete process.env[variableName];
      } else {
        process.env[variableName] = originalValue;
      }
    });
  });

  it('normalizes the application environment used by cookie security', () => {
    process.env.NODE_ENV = ' Production ';

    expect(configuration().app.environment).toBe('production');
  });

  it('uses the Voice Call media environment contract', () => {
    process.env.TWILIO_VOICE_MEDIA_BASE_URL =
      ' https://api.example.com/api/voice-call/media ';

    expect(configuration().twilio.voiceMediaBaseUrl).toBe(
      'https://api.example.com/api/voice-call/media',
    );
  });

  it('derives the scheduler Redis connection from the shared URL', () => {
    process.env.REDIS_URL = 'redis://redis.internal:6380';
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;

    expect(configuration().redis).toEqual({
      url: 'redis://redis.internal:6380',
      host: 'redis.internal',
      port: 6380,
    });
  });

  it('groups normalized Firebase and AWS provider settings', () => {
    process.env.FIREBASE_PROJECT_ID = ' voice-project ';
    process.env.FIREBASE_CLIENT_EMAIL = ' firebase@example.com ';
    process.env.FIREBASE_PRIVATE_KEY = ' line-one\\nline-two ';
    process.env.AWS_REGION = ' eu-central-1 ';
    process.env.AWS_ACCESS_KEY_ID = ' access-key ';
    process.env.AWS_SECRET_ACCESS_KEY = ' secret-key ';

    const result = configuration();

    expect(result.firebase).toEqual({
      projectId: 'voice-project',
      clientEmail: 'firebase@example.com',
      privateKey: 'line-one\nline-two',
    });
    expect(result.aws).toEqual({
      region: 'eu-central-1',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
    });
  });
});
