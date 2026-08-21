import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../integrations/redis/redis.service';
import {
  PendingRegistration,
  PendingRegistrationStore,
} from './pending-registration.store';

describe('PendingRegistrationStore', () => {
  const phoneNumber = '+905551112233';
  const registration: PendingRegistration = {
    version: 1,
    firstName: 'Test',
    lastName: 'User',
    email: 'user@example.com',
    phoneNumber,
    passwordHash: 'bcrypt-hash',
    createdAt: '2026-08-13T10:00:00.000Z',
  };
  let redisService: {
    setWithExpiry: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
  };
  let store: PendingRegistrationStore;

  beforeEach(() => {
    redisService = {
      setWithExpiry: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    store = new PendingRegistrationStore(
      redisService as unknown as RedisService,
      {
        getOrThrow: jest.fn().mockReturnValue(600),
      } as unknown as ConfigService,
    );
  });

  it('stores only the password hash under a non-PII expiring key', async () => {
    await store.save(registration);

    const [key, value, ttlSeconds] = redisService.setWithExpiry.mock
      .calls[0] as [string, string, number];

    expect(key).not.toContain(phoneNumber);
    expect(key).toMatch(/^auth:pending-registration:v1:[0-9a-f]{64}$/);
    expect(JSON.parse(value)).toEqual(registration);
    expect(value).not.toContain('plain-password');
    expect(ttlSeconds).toBe(600);
  });

  it('reads a valid pending registration', async () => {
    redisService.get.mockResolvedValue(JSON.stringify(registration));

    await expect(store.findByPhoneNumber(phoneNumber)).resolves.toEqual(
      registration,
    );
  });

  it.each(['invalid-json', JSON.stringify({ version: 2 })])(
    'removes an invalid stored value',
    async (value) => {
      redisService.get.mockResolvedValue(value);

      await expect(store.findByPhoneNumber(phoneNumber)).resolves.toBeNull();
      expect(redisService.delete).toHaveBeenCalledTimes(1);
    },
  );

  it('returns null for an expired registration', async () => {
    redisService.get.mockResolvedValue(null);

    await expect(store.findByPhoneNumber(phoneNumber)).resolves.toBeNull();
    expect(redisService.delete).not.toHaveBeenCalled();
  });

  it('exposes only the configured public expiry duration', () => {
    expect(store.getExpiresInSeconds()).toBe(600);
  });
});
