import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../integrations/redis/redis.service';

export type OtpChallengePurpose = 'PHONE_CHANGE';

export interface OtpChallenge {
  version: 1;
  challengeId: string;
  purpose: OtpChallengePurpose;
  subject: string;
  userId: string;
  phoneNumber: string;
  createdAt: string;
}

@Injectable()
export class OtpChallengeStore {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    configService: ConfigService,
  ) {
    this.ttlSeconds = configService.getOrThrow<number>(
      'otp.pendingRegistrationTtlSeconds',
    );
  }

  getExpiresInSeconds(): number {
    return this.ttlSeconds;
  }

  getRemainingSeconds(
    challenge: OtpChallenge,
    currentDate = new Date(),
  ): number {
    const createdAt = Date.parse(challenge.createdAt);

    if (Number.isNaN(createdAt)) {
      return 0;
    }

    const elapsedSeconds = Math.floor(
      (currentDate.getTime() - createdAt) / 1000,
    );

    return Math.max(0, this.ttlSeconds - elapsedSeconds);
  }

  create(challenge: OtpChallenge): Promise<boolean> {
    return this.redisService.setIfAbsentWithExpiry(
      this.createKey(challenge.purpose, challenge.subject),
      JSON.stringify(challenge),
      this.ttlSeconds,
    );
  }

  async find(
    purpose: OtpChallengePurpose,
    subject: string,
  ): Promise<OtpChallenge | null> {
    const key = this.createKey(purpose, subject);
    const serializedChallenge = await this.redisService.get(key);

    if (!serializedChallenge) {
      return null;
    }

    try {
      const challenge: unknown = JSON.parse(serializedChallenge);

      if (!this.isValidChallenge(challenge, purpose, subject)) {
        await this.redisService.delete(key);
        return null;
      }

      return challenge;
    } catch {
      await this.redisService.delete(key);
      return null;
    }
  }

  delete(purpose: OtpChallengePurpose, subject: string): Promise<void> {
    return this.redisService.delete(this.createKey(purpose, subject));
  }

  claim(challenge: OtpChallenge): Promise<boolean> {
    return this.redisService.setIfAbsentWithExpiry(
      this.createClaimKey(challenge.challengeId),
      '1',
      this.ttlSeconds,
    );
  }

  private createKey(purpose: OtpChallengePurpose, subject: string): string {
    const subjectFingerprint = createHash('sha256')
      .update(subject.trim().toLowerCase(), 'utf8')
      .digest('hex');

    return `otp:challenge:v1:${purpose.toLowerCase()}:${subjectFingerprint}`;
  }

  private createClaimKey(challengeId: string): string {
    const challengeFingerprint = createHash('sha256')
      .update(challengeId, 'utf8')
      .digest('hex');

    return `otp:challenge-claim:v1:${challengeFingerprint}`;
  }

  private isValidChallenge(
    value: unknown,
    purpose: OtpChallengePurpose,
    subject: string,
  ): value is OtpChallenge {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const challenge = value as Partial<OtpChallenge>;

    return (
      challenge.version === 1 &&
      typeof challenge.challengeId === 'string' &&
      challenge.challengeId.length > 0 &&
      challenge.purpose === purpose &&
      challenge.subject === subject &&
      typeof challenge.userId === 'string' &&
      challenge.userId.length > 0 &&
      typeof challenge.phoneNumber === 'string' &&
      challenge.phoneNumber.length > 0 &&
      typeof challenge.createdAt === 'string' &&
      !Number.isNaN(Date.parse(challenge.createdAt))
    );
  }
}
