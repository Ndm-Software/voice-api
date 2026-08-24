const requiredStringVariables = [
  'NODE_ENV',
  'DATABASE_URL',
  'FRONTEND_URL',
  'JWT_ACCESS_SECRET',
  'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_SECRET',
  'JWT_REFRESH_EXPIRES_IN',
  'REDIS_URL',
  'OTP_PENDING_REGISTRATION_TTL_SECONDS',
  'OTP_RESEND_COOLDOWN_SECONDS',
  'OTP_MAX_VERIFY_ATTEMPTS',
  'OTP_RATE_LIMIT_WINDOW_SECONDS',
  'OTP_PHONE_SEND_LIMIT',
  'OTP_IP_SEND_LIMIT',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
] as const;

const durationPattern = /^\d+\s*(s|m|h|d)$/;
const fakeOtpCodePattern = /^\d{6}$/;
const twilioAccountSidPattern = /^AC[0-9a-fA-F]{32}$/;
const twilioVerifyServiceSidPattern = /^VA[0-9a-fA-F]{32}$/;
const e164PhoneNumberPattern = /^\+[1-9]\d{7,14}$/;
const supportedNodeEnvironments = new Set([
  'development',
  'test',
  'production',
]);
const positiveIntegerVariables = [
  'OTP_PENDING_REGISTRATION_TTL_SECONDS',
  'OTP_RESEND_COOLDOWN_SECONDS',
  'OTP_MAX_VERIFY_ATTEMPTS',
  'OTP_RATE_LIMIT_WINDOW_SECONDS',
  'OTP_PHONE_SEND_LIMIT',
  'OTP_IP_SEND_LIMIT',
] as const;

const isUrlWithProtocol = (value: string, protocols: string[]): boolean => {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export const validateEnvironment = (
  input: Record<string, unknown>,
): Record<string, unknown> => {
  const config = { ...input };
  const errors: string[] = [];

  for (const variableName of requiredStringVariables) {
    const value = config[variableName];

    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${variableName} is required`);
      continue;
    }

    config[variableName] = value.trim();
  }

  const nodeEnvironment =
    typeof config.NODE_ENV === 'string'
      ? config.NODE_ENV.trim().toLowerCase()
      : '';
  const otpProvider =
    typeof config.OTP_PROVIDER === 'string'
      ? config.OTP_PROVIDER.trim().toLowerCase()
      : 'fake';

  config.NODE_ENV = nodeEnvironment;
  config.OTP_PROVIDER = otpProvider;

  if (
    nodeEnvironment.length > 0 &&
    !supportedNodeEnvironments.has(nodeEnvironment)
  ) {
    errors.push('NODE_ENV must be one of: development, test, production');
  }

  if (otpProvider !== 'fake' && otpProvider !== 'twilio') {
    errors.push('OTP_PROVIDER must be one of: fake, twilio');
  }

  if (otpProvider === 'fake') {
    const fakeCode =
      typeof config.OTP_FAKE_CODE === 'string'
        ? config.OTP_FAKE_CODE.trim()
        : '123456';

    config.OTP_FAKE_CODE = fakeCode;

    if (!fakeOtpCodePattern.test(fakeCode)) {
      errors.push('OTP_FAKE_CODE must contain exactly 6 digits');
    }

    if (
      supportedNodeEnvironments.has(nodeEnvironment) &&
      nodeEnvironment !== 'development' &&
      nodeEnvironment !== 'test'
    ) {
      errors.push('OTP_PROVIDER=fake is allowed only in development or test');
    }
  }

  if (otpProvider === 'twilio') {
    const verifyServiceSid = config.TWILIO_VERIFY_SERVICE_SID;

    if (
      typeof verifyServiceSid !== 'string' ||
      verifyServiceSid.trim().length === 0
    ) {
      errors.push('TWILIO_VERIFY_SERVICE_SID is required');
    } else {
      config.TWILIO_VERIFY_SERVICE_SID = verifyServiceSid.trim();

      if (!twilioVerifyServiceSidPattern.test(verifyServiceSid.trim())) {
        errors.push('TWILIO_VERIFY_SERVICE_SID has an invalid format');
      }
    }
  }

  const port = config.PORT === undefined ? 3001 : Number(config.PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT must be an integer between 1 and 65535');
  } else {
    config.PORT = port;
  }

  const trustProxyHops =
    config.TRUST_PROXY_HOPS === undefined ? 0 : Number(config.TRUST_PROXY_HOPS);

  if (
    !Number.isInteger(trustProxyHops) ||
    trustProxyHops < 0 ||
    trustProxyHops > 10
  ) {
    errors.push('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  } else {
    config.TRUST_PROXY_HOPS = trustProxyHops;
  }

  const databaseUrl = config.DATABASE_URL;
  if (
    typeof databaseUrl === 'string' &&
    !isUrlWithProtocol(databaseUrl, ['postgres:', 'postgresql:'])
  ) {
    errors.push('DATABASE_URL must be a PostgreSQL URL');
  }

  const frontendUrl = config.FRONTEND_URL;
  if (
    typeof frontendUrl === 'string' &&
    !isUrlWithProtocol(frontendUrl, ['http:', 'https:'])
  ) {
    errors.push('FRONTEND_URL must be an HTTP or HTTPS URL');
  }

  const redisUrl = config.REDIS_URL;
  let parsedRedisUrl: URL | undefined;

  if (
    typeof redisUrl === 'string' &&
    !isUrlWithProtocol(redisUrl, ['redis:', 'rediss:'])
  ) {
    errors.push('REDIS_URL must be a Redis URL');
  } else if (typeof redisUrl === 'string') {
    parsedRedisUrl = new URL(redisUrl);
  }

  const redisHost =
    typeof config.REDIS_HOST === 'string'
      ? config.REDIS_HOST.trim()
      : (parsedRedisUrl?.hostname ?? '');

  if (redisHost.length === 0) {
    errors.push('REDIS_HOST is required');
  } else {
    config.REDIS_HOST = redisHost;
  }

  const redisPort =
    config.REDIS_PORT === undefined
      ? Number(parsedRedisUrl?.port || 6379)
      : Number(config.REDIS_PORT);

  if (!Number.isInteger(redisPort) || redisPort < 1 || redisPort > 65535) {
    errors.push('REDIS_PORT must be an integer between 1 and 65535');
  } else {
    config.REDIS_PORT = redisPort;
  }

  for (const variableName of positiveIntegerVariables) {
    const value = Number(config[variableName]);

    if (!Number.isInteger(value) || value < 1) {
      errors.push(`${variableName} must be a positive integer`);
    } else {
      config[variableName] = value;
    }
  }

  const pendingRegistrationTtl = Number(
    config.OTP_PENDING_REGISTRATION_TTL_SECONDS,
  );
  const resendCooldown = Number(config.OTP_RESEND_COOLDOWN_SECONDS);

  if (
    Number.isInteger(pendingRegistrationTtl) &&
    Number.isInteger(resendCooldown) &&
    resendCooldown > pendingRegistrationTtl
  ) {
    errors.push(
      'OTP_RESEND_COOLDOWN_SECONDS must not exceed OTP_PENDING_REGISTRATION_TTL_SECONDS',
    );
  }

  for (const variableName of [
    'JWT_ACCESS_EXPIRES_IN',
    'JWT_REFRESH_EXPIRES_IN',
  ] as const) {
    const value = config[variableName];

    if (typeof value === 'string' && !durationPattern.test(value)) {
      errors.push(`${variableName} must use s, m, h, or d units`);
    }
  }

  const accountSid = config.TWILIO_ACCOUNT_SID;
  if (
    typeof accountSid === 'string' &&
    !twilioAccountSidPattern.test(accountSid)
  ) {
    errors.push('TWILIO_ACCOUNT_SID has an invalid format');
  }

  const twilioPhoneNumber = config.TWILIO_PHONE_NUMBER;
  if (
    typeof twilioPhoneNumber === 'string' &&
    !e164PhoneNumberPattern.test(twilioPhoneNumber)
  ) {
    errors.push('TWILIO_PHONE_NUMBER must use E.164 format');
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.join('; ')}`);
  }

  return config;
};
