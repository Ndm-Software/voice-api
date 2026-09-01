import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../integrations/redis/redis.service';
import { OtpChallenge, OtpChallengeStore } from './otp-challenge.store';

describe('OtpChallengeStore', () => {
  const challenge: OtpChallenge = {
    version: 1,
    challengeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    purpose: 'PHONE_CHANGE',
    subject: 'user-id',
    userId: 'user-id',
    phoneNumber: '+905551112233',
    createdAt: '2026-08-28T09:00:00.000Z',
  };
  const redisService: jest.Mocked<
    Pick<RedisService, 'delete' | 'get' | 'setIfAbsentWithExpiry'>
  > = {
    delete: jest.fn<
      ReturnType<RedisService['delete']>,
      Parameters<RedisService['delete']>
    >(),
    get: jest.fn<
      ReturnType<RedisService['get']>,
      Parameters<RedisService['get']>
    >(),
    setIfAbsentWithExpiry: jest.fn<
      ReturnType<RedisService['setIfAbsentWithExpiry']>,
      Parameters<RedisService['setIfAbsentWithExpiry']>
    >(),
  };
  const store = new OtpChallengeStore(
    redisService as unknown as RedisService,
    {
      getOrThrow: jest.fn().mockReturnValue(600),
    } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores challenges under a hashed subject key with the shared OTP TTL', async () => {
    redisService.setIfAbsentWithExpiry.mockResolvedValueOnce(true);

    await expect(store.create(challenge)).resolves.toBe(true);

    expect(redisService.setIfAbsentWithExpiry).toHaveBeenCalledWith(
      expect.stringMatching(/^otp:challenge:v1:phone_change:[0-9a-f]{64}$/),
      JSON.stringify(challenge),
      600,
    );
    const key = redisService.setIfAbsentWithExpiry.mock.calls[0][0];
    expect(key).not.toContain(challenge.subject);
  });

  it('returns a valid challenge only for its purpose and subject', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify(challenge));

    await expect(store.find('PHONE_CHANGE', 'user-id')).resolves.toEqual(
      challenge,
    );
    expect(redisService.delete).not.toHaveBeenCalled();
  });

  it('atomically claims a challenge under a non-PII single-use key', async () => {
    redisService.setIfAbsentWithExpiry.mockResolvedValueOnce(true);

    await expect(store.claim(challenge)).resolves.toBe(true);

    expect(redisService.setIfAbsentWithExpiry).toHaveBeenCalledWith(
      expect.stringMatching(/^otp:challenge-claim:v1:[0-9a-f]{64}$/),
      '1',
      600,
    );
    const claimKey = redisService.setIfAbsentWithExpiry.mock.calls[0][0];
    expect(claimKey).not.toContain(challenge.challengeId);
    expect(claimKey).not.toContain(challenge.phoneNumber);
  });

  it('deletes malformed or mismatched challenge data', async () => {
    redisService.get.mockResolvedValueOnce(
      JSON.stringify({ ...challenge, subject: 'another-user' }),
    );
    redisService.delete.mockResolvedValueOnce(undefined);

    await expect(store.find('PHONE_CHANGE', 'user-id')).resolves.toBeNull();
    expect(redisService.delete).toHaveBeenCalledTimes(1);
  });

  it('exposes only the configured lifetime, never stored challenge data', () => {
    expect(store.getExpiresInSeconds()).toBe(600);
  });

  it('calculates the remaining challenge lifetime from its creation time', () => {
    expect(
      store.getRemainingSeconds(
        challenge,
        new Date('2026-08-28T09:05:00.000Z'),
      ),
    ).toBe(300);
  });
});
