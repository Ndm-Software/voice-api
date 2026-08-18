import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../integrations/redis/redis.service';
import { OtpSecurityService } from './otp-security.service';

describe('OtpSecurityService', () => {
  const phoneNumber = '+905551112233';
  const ipAddress = '203.0.113.10';
  let redisService: jest.Mocked<
    Pick<
      RedisService,
      'setIfAbsentWithExpiry' | 'incrementWithExpiry' | 'delete'
    >
  >;
  let service: OtpSecurityService;

  const expectHttpErrorCode = async (
    operation: Promise<unknown>,
    code: string,
  ): Promise<void> => {
    let caughtError: unknown;

    try {
      await operation;
    } catch (error: unknown) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(HttpException);
    expect((caughtError as HttpException).getResponse()).toEqual(
      expect.objectContaining({ code }),
    );
  };

  beforeEach(() => {
    redisService = {
      setIfAbsentWithExpiry: jest
        .fn<RedisService['setIfAbsentWithExpiry']>()
        .mockResolvedValue(true),
      incrementWithExpiry: jest
        .fn<RedisService['incrementWithExpiry']>()
        .mockResolvedValue(1),
      delete: jest.fn<RedisService['delete']>().mockResolvedValue(undefined),
    };
    const config = {
      'otp.pendingRegistrationTtlSeconds': 600,
      'otp.resendCooldownSeconds': 60,
      'otp.maxVerifyAttempts': 5,
      'otp.rateLimitWindowSeconds': 3600,
      'otp.phoneSendLimit': 5,
      'otp.ipSendLimit': 20,
    };
    service = new OtpSecurityService(
      redisService as unknown as RedisService,
      {
        getOrThrow: jest.fn((key: keyof typeof config) => config[key]),
      } as unknown as ConfigService,
    );
  });

  it('uses hashed phone and IP keys for an allowed send', async () => {
    await expect(
      service.consumeSend(phoneNumber, ipAddress),
    ).resolves.toBeUndefined();

    const cooldownKey = redisService.setIfAbsentWithExpiry.mock.calls[0][0];
    const counterKeys = redisService.incrementWithExpiry.mock.calls.map(
      ([key]) => key,
    );
    const keys = [cooldownKey, ...counterKeys];

    expect(keys).toHaveLength(3);
    expect(keys.every((key) => !key.includes(phoneNumber))).toBe(true);
    expect(keys.every((key) => !key.includes(ipAddress))).toBe(true);
  });

  it('blocks a send during the resend cooldown', async () => {
    redisService.setIfAbsentWithExpiry.mockResolvedValue(false);

    await expectHttpErrorCode(
      service.consumeSend(phoneNumber, ipAddress),
      'OTP_RESEND_COOLDOWN',
    );
    expect(redisService.incrementWithExpiry).not.toHaveBeenCalled();
  });

  it.each([
    [6, 1],
    [1, 21],
  ])('blocks sends over phone or IP limits', async (phoneCount, ipCount) => {
    redisService.incrementWithExpiry
      .mockResolvedValueOnce(phoneCount)
      .mockResolvedValueOnce(ipCount);

    await expectHttpErrorCode(
      service.consumeSend(phoneNumber, ipAddress),
      'OTP_RATE_LIMITED',
    );
  });

  it('marks the final allowed verification attempt', async () => {
    redisService.incrementWithExpiry.mockResolvedValue(5);

    await expect(
      service.consumeVerificationAttempt(phoneNumber),
    ).resolves.toEqual({ isFinalAttempt: true });
  });

  it('blocks verification attempts over the configured limit', async () => {
    redisService.incrementWithExpiry.mockResolvedValue(6);

    await expectHttpErrorCode(
      service.consumeVerificationAttempt(phoneNumber),
      'OTP_ATTEMPT_LIMIT_EXCEEDED',
    );
  });

  it('clears the hashed verification attempt key', async () => {
    await service.clearVerificationAttempts(phoneNumber);

    const [[key]] = redisService.delete.mock.calls;
    expect(key).toMatch(/^otp:verify:attempt:v1:[0-9a-f]{64}$/);
    expect(key).not.toContain(phoneNumber);
  });
});
