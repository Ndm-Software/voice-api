import { createHash } from 'node:crypto';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../../integrations/redis/redis.service';

export interface OtpVerificationAttempt {
  isFinalAttempt: boolean;
}

@Injectable()
export class OtpSecurityService {
  private readonly pendingRegistrationTtlSeconds: number;
  private readonly resendCooldownSeconds: number;
  private readonly maxVerifyAttempts: number;
  private readonly rateLimitWindowSeconds: number;
  private readonly phoneSendLimit: number;
  private readonly ipSendLimit: number;

  constructor(
    private readonly redisService: RedisService,
    configService: ConfigService,
  ) {
    this.pendingRegistrationTtlSeconds = configService.getOrThrow<number>(
      'otp.pendingRegistrationTtlSeconds',
    );
    this.resendCooldownSeconds = configService.getOrThrow<number>(
      'otp.resendCooldownSeconds',
    );
    this.maxVerifyAttempts = configService.getOrThrow<number>(
      'otp.maxVerifyAttempts',
    );
    this.rateLimitWindowSeconds = configService.getOrThrow<number>(
      'otp.rateLimitWindowSeconds',
    );
    this.phoneSendLimit =
      configService.getOrThrow<number>('otp.phoneSendLimit');
    this.ipSendLimit = configService.getOrThrow<number>('otp.ipSendLimit');
  }

  async consumeSend(phoneNumber: string, ipAddress: string): Promise<void> {
    const phoneFingerprint = this.createFingerprint(phoneNumber);
    const ipFingerprint = this.createFingerprint(ipAddress || 'unknown');
    const cooldownAccepted = await this.redisService.setIfAbsentWithExpiry(
      `otp:send:cooldown:v1:${phoneFingerprint}`,
      '1',
      this.resendCooldownSeconds,
    );

    if (!cooldownAccepted) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'OTP_RESEND_COOLDOWN',
          message: 'Yeni kod istemeden önce bekleyin.',
          retryAfterSeconds: this.resendCooldownSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const [phoneCount, ipCount] = await Promise.all([
      this.redisService.incrementWithExpiry(
        `otp:send:phone:v1:${phoneFingerprint}`,
        this.rateLimitWindowSeconds,
      ),
      this.redisService.incrementWithExpiry(
        `otp:send:ip:v1:${ipFingerprint}`,
        this.rateLimitWindowSeconds,
      ),
    ]);

    if (phoneCount > this.phoneSendLimit || ipCount > this.ipSendLimit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'OTP_RATE_LIMITED',
          message: 'Çok fazla doğrulama isteği gönderildi.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async consumeVerificationAttempt(
    phoneNumber: string,
  ): Promise<OtpVerificationAttempt> {
    const count = await this.redisService.incrementWithExpiry(
      this.createVerificationAttemptKey(phoneNumber),
      this.pendingRegistrationTtlSeconds,
    );

    if (count > this.maxVerifyAttempts) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'OTP_ATTEMPT_LIMIT_EXCEEDED',
          message: 'Doğrulama deneme sınırı aşıldı.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return {
      isFinalAttempt: count === this.maxVerifyAttempts,
    };
  }

  clearVerificationAttempts(phoneNumber: string): Promise<void> {
    return this.redisService.delete(
      this.createVerificationAttemptKey(phoneNumber),
    );
  }

  private createVerificationAttemptKey(phoneNumber: string): string {
    return `otp:verify:attempt:v1:${this.createFingerprint(phoneNumber)}`;
  }

  private createFingerprint(value: string): string {
    return createHash('sha256')
      .update(value.trim().toLowerCase(), 'utf8')
      .digest('hex');
  }
}
