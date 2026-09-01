const optionalEnvironmentValue = (
  value: string | undefined,
): string | undefined => {
  const normalizedValue = value?.trim();

  return normalizedValue ? normalizedValue : undefined;
};

const parseUrl = (value: string | undefined): URL | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value);
  } catch {
    return undefined;
  }
};

export const configuration = () => {
  const redisUrl = optionalEnvironmentValue(process.env.REDIS_URL);
  const parsedRedisUrl = parseUrl(redisUrl);
  const firebasePrivateKey = optionalEnvironmentValue(
    process.env.FIREBASE_PRIVATE_KEY,
  )?.replace(/\\n/g, '\n');

  return {
    app: {
      environment: process.env.NODE_ENV?.trim().toLowerCase() ?? 'development',
      port: Number(process.env.PORT ?? 3001),
      frontendUrl: process.env.FRONTEND_URL,
      trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
    },
    database: {
      url: process.env.DATABASE_URL,
    },
    auth: {
      accessSecret: process.env.JWT_ACCESS_SECRET,
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    },
    redis: {
      url: redisUrl,
      host:
        optionalEnvironmentValue(process.env.REDIS_HOST) ??
        parsedRedisUrl?.hostname,
      port: Number(
        optionalEnvironmentValue(process.env.REDIS_PORT) ??
          parsedRedisUrl?.port ??
          6379,
      ),
    },
    otp: {
      provider: process.env.OTP_PROVIDER?.trim().toLowerCase() ?? 'fake',
      fakeCode: process.env.OTP_FAKE_CODE?.trim() ?? '123456',
      pendingRegistrationTtlSeconds: Number(
        process.env.OTP_PENDING_REGISTRATION_TTL_SECONDS,
      ),
      resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS),
      maxVerifyAttempts: Number(process.env.OTP_MAX_VERIFY_ATTEMPTS),
      rateLimitWindowSeconds: Number(process.env.OTP_RATE_LIMIT_WINDOW_SECONDS),
      phoneSendLimit: Number(process.env.OTP_PHONE_SEND_LIMIT),
      ipSendLimit: Number(process.env.OTP_IP_SEND_LIMIT),
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
      voiceMediaBaseUrl: optionalEnvironmentValue(
        process.env.TWILIO_VOICE_MEDIA_BASE_URL,
      ),
      verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
    },
    firebase: {
      projectId: optionalEnvironmentValue(process.env.FIREBASE_PROJECT_ID),
      clientEmail: optionalEnvironmentValue(process.env.FIREBASE_CLIENT_EMAIL),
      privateKey: firebasePrivateKey,
    },
    aws: {
      region: optionalEnvironmentValue(process.env.AWS_REGION),
      accessKeyId: optionalEnvironmentValue(process.env.AWS_ACCESS_KEY_ID),
      secretAccessKey: optionalEnvironmentValue(
        process.env.AWS_SECRET_ACCESS_KEY,
      ),
    },
  };
};
