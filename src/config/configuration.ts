export const configuration = () => ({
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
    url: process.env.REDIS_URL,
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
    twimlUrl: process.env.TWILIO_TWIML_URL,
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
  },
});
