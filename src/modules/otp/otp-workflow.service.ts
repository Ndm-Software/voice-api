import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PhoneOtpDto, VerifyPhoneOtpDto } from './dto/phone-otp.dto';
import { OtpChallenge, OtpChallengeStore } from './otp-challenge.store';
import { OtpSecurityService } from './otp-security.service';
import { OtpService } from './otp.service';

@Injectable()
export class OtpWorkflowService {
  private readonly logger = new Logger(OtpWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly otpSecurityService: OtpSecurityService,
    private readonly challengeStore: OtpChallengeStore,
  ) {}

  async requestPhoneChange(
    userId: string,
    dto: PhoneOtpDto,
    ipAddress: string,
  ) {
    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber);

    await this.otpSecurityService.consumeSend(phoneNumber, ipAddress);

    const [user, phoneOwner] = await Promise.all([
      this.prisma.user.findUnique({
        where: { userId },
        select: { phoneNumber: true },
      }),
      this.prisma.user.findUnique({
        where: { phoneNumber },
        select: { userId: true },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    if (user.phoneNumber === phoneNumber) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'PHONE_NUMBER_UNCHANGED',
        message: 'Yeni telefon numarası mevcut numarayla aynı olamaz.',
      });
    }

    if (phoneOwner && phoneOwner.userId !== userId) {
      return this.createAcknowledgement();
    }

    const challenge: OtpChallenge = {
      version: 1,
      challengeId: randomUUID(),
      purpose: 'PHONE_CHANGE',
      subject: userId,
      userId,
      phoneNumber,
      createdAt: new Date().toISOString(),
    };

    const challengeCreated = await this.challengeStore.create(challenge);

    if (!challengeCreated) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: 'OTP_CHALLENGE_ACTIVE',
        message:
          'Devam eden telefon doğrulaması tamamlanmalı veya süresi dolmalı.',
      });
    }

    try {
      await this.otpService.requestCode(phoneNumber);
    } catch (error: unknown) {
      this.logger.warn('Phone change OTP delivery failed.');
      throw error;
    }

    return this.createAcknowledgement();
  }

  async resendPhoneChange(userId: string, dto: PhoneOtpDto, ipAddress: string) {
    const requestedPhoneNumber = this.normalizePhoneNumber(dto.phoneNumber);
    const challenge = await this.challengeStore.find('PHONE_CHANGE', userId);

    if (
      challenge &&
      challenge.phoneNumber === requestedPhoneNumber &&
      this.challengeStore.getRemainingSeconds(challenge) <=
        this.otpSecurityService.getResendCooldownSeconds()
    ) {
      await this.deleteChallengeQuietly(userId);
      this.throwInvalidOrExpiredOtp();
    }

    await this.otpSecurityService.consumeSend(
      challenge?.phoneNumber ?? requestedPhoneNumber,
      ipAddress,
    );

    if (!challenge || challenge.phoneNumber !== requestedPhoneNumber) {
      return this.createAcknowledgement();
    }

    const phoneOwner = await this.prisma.user.findUnique({
      where: { phoneNumber: challenge.phoneNumber },
      select: { userId: true },
    });

    if (phoneOwner && phoneOwner.userId !== userId) {
      await this.deleteChallengeQuietly(userId);
      return this.createAcknowledgement();
    }

    try {
      await this.otpService.requestCode(challenge.phoneNumber);
    } catch (error: unknown) {
      this.logger.warn('Phone change OTP resend failed.');
      throw error;
    }

    return this.createAcknowledgement(
      this.challengeStore.getRemainingSeconds(challenge),
    );
  }

  async verifyPhoneChange(userId: string, dto: VerifyPhoneOtpDto) {
    const phoneNumber = this.normalizePhoneNumber(dto.phoneNumber);
    const challenge = await this.challengeStore.find('PHONE_CHANGE', userId);

    if (!challenge || challenge.phoneNumber !== phoneNumber) {
      this.throwInvalidOrExpiredOtp();
    }

    const verificationScope = `phone-change:${userId}`;
    const attempt = await this.otpSecurityService.consumeVerificationAttempt(
      phoneNumber,
      verificationScope,
    );
    const approved = await this.otpService.verifyCode(phoneNumber, dto.code);

    if (!approved) {
      if (attempt.isFinalAttempt) {
        await this.deleteChallengeQuietly(userId);
      }

      this.throwInvalidOrExpiredOtp();
    }

    const claimed = await this.challengeStore.claim(challenge);

    if (!claimed) {
      this.throwInvalidOrExpiredOtp();
    }

    try {
      await this.prisma.user.update({
        where: { userId },
        data: {
          phoneNumber,
          phoneVerified: true,
        },
      });
    } catch (error: unknown) {
      await this.cleanupCompletedChallenge(
        userId,
        phoneNumber,
        verificationScope,
      );

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.throwPhoneNumberConflict();
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Kullanıcı bulunamadı.');
      }

      throw error;
    }

    await this.cleanupCompletedChallenge(
      userId,
      phoneNumber,
      verificationScope,
    );

    return {
      message: 'Telefon numarası başarıyla güncellendi.',
    };
  }

  private createAcknowledgement(
    expiresInSeconds = this.challengeStore.getExpiresInSeconds(),
  ) {
    return {
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds,
    };
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    const value = phoneNumber.trim();

    if (value.startsWith('+')) {
      return value;
    }

    const nationalNumber = value.startsWith('0') ? value.slice(1) : value;

    return `+90${nationalNumber}`;
  }

  private throwInvalidOrExpiredOtp(): never {
    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'OTP_INVALID_OR_EXPIRED',
      message: 'Doğrulama kodu geçersiz veya süresi dolmuş.',
    });
  }

  private throwPhoneNumberConflict(): never {
    throw new ConflictException({
      statusCode: HttpStatus.CONFLICT,
      code: 'PHONE_NUMBER_UNAVAILABLE',
      message: 'Telefon numarası kullanılamıyor.',
    });
  }

  private async cleanupCompletedChallenge(
    userId: string,
    phoneNumber: string,
    verificationScope: string,
  ): Promise<void> {
    const results = await Promise.allSettled([
      this.challengeStore.delete('PHONE_CHANGE', userId),
      this.otpSecurityService.clearVerificationAttempts(
        phoneNumber,
        verificationScope,
      ),
    ]);

    if (results.some((result) => result.status === 'rejected')) {
      this.logger.warn('Completed PHONE_CHANGE OTP cleanup failed.');
    }
  }

  private async deleteChallengeQuietly(userId: string): Promise<void> {
    try {
      await this.challengeStore.delete('PHONE_CHANGE', userId);
    } catch {
      this.logger.warn('PHONE_CHANGE OTP challenge cleanup failed.');
    }
  }
}
