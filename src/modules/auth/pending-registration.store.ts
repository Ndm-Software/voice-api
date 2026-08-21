import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../integrations/redis/redis.service';

export interface PendingRegistration {
  version: 1;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
  createdAt: string;
}

const keyPrefix = 'auth:pending-registration:v1:';

@Injectable()
export class PendingRegistrationStore {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    configService: ConfigService,
  ) {
    this.ttlSeconds = configService.getOrThrow<number>(
      'otp.pendingRegistrationTtlSeconds',
    );
  }

  async save(registration: PendingRegistration): Promise<void> {
    await this.redisService.setWithExpiry(
      this.createKey(registration.phoneNumber),
      JSON.stringify(registration),
      this.ttlSeconds,
    );
  }

  async findByPhoneNumber(
    phoneNumber: string,
  ): Promise<PendingRegistration | null> {
    const key = this.createKey(phoneNumber);
    const value = await this.redisService.get(key);

    if (!value) {
      return null;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(value);
    } catch {
      await this.redisService.delete(key);

      return null;
    }

    if (this.isPendingRegistration(parsed)) {
      return parsed;
    }

    await this.redisService.delete(key);

    return null;
  }

  delete(phoneNumber: string): Promise<void> {
    return this.redisService.delete(this.createKey(phoneNumber));
  }

  getExpiresInSeconds(): number {
    return this.ttlSeconds;
  }

  private createKey(phoneNumber: string): string {
    const fingerprint = createHash('sha256')
      .update(phoneNumber, 'utf8')
      .digest('hex');

    return `${keyPrefix}${fingerprint}`;
  }

  private isPendingRegistration(value: unknown): value is PendingRegistration {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const record = value as Record<string, unknown>;

    return (
      record.version === 1 &&
      typeof record.firstName === 'string' &&
      typeof record.lastName === 'string' &&
      typeof record.email === 'string' &&
      typeof record.phoneNumber === 'string' &&
      typeof record.passwordHash === 'string' &&
      typeof record.createdAt === 'string'
    );
  }
}
