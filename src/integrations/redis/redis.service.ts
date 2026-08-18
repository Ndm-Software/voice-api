import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';

import { RedisClient } from './redis-client.interface';
import { REDIS_CLIENT } from './redis.constants';

const incrementWithExpiryScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: RedisClient) {}

  async onModuleInit(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async setWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(key, value, { EX: ttlSeconds });
  }

  async setIfAbsentWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.client.set(key, value, {
      EX: ttlSeconds,
      NX: true,
    });

    return result === 'OK';
  }

  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    const result = await this.client.eval(incrementWithExpiryScript, {
      keys: [key],
      arguments: [String(ttlSeconds)],
    });

    if (typeof result !== 'number') {
      throw new Error('Redis counter returned an invalid result');
    }

    return result;
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }
}
