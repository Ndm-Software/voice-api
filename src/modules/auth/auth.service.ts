import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { isUUID } from 'class-validator';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { DevicesService } from '../devices/devices.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OtpService } from '../otp/otp.service';
import { OtpSecurityService } from '../otp/otp-security.service';
import { PendingRegistrationStore } from './pending-registration.store';
import { normalizePhoneNumber } from './utils/normalize-phone-number';
import { ResendRegistrationOtpDto } from './dto/resend-registration-otp.dto';
import { VerifyRegistrationDto } from './dto/verify-registration.dto';

const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly devicesService: DevicesService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly pendingRegistrationStore: PendingRegistrationStore,
    private readonly otpService: OtpService,
    private readonly otpSecurityService: OtpSecurityService,
  ) {}

  async register(dto: RegisterDto, ipAddress: string) {
    const email = dto.email.trim().toLowerCase();
    const phoneNumber = normalizePhoneNumber(dto.phoneNumber);

    await this.otpSecurityService.consumeSend(phoneNumber, ipAddress);

    const [existingEmail, existingPhone, passwordHash] = await Promise.all([
      this.usersService.findByEmail(email),
      this.usersService.findByPhoneNumber(phoneNumber),
      bcrypt.hash(dto.password, 12),
    ]);

    if (existingEmail || existingPhone) {
      return this.createRegistrationAcknowledgement();
    }

    try {
      await this.pendingRegistrationStore.save({
        version: 1,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email,
        phoneNumber,
        passwordHash,
        createdAt: new Date().toISOString(),
      });
      await this.otpService.requestCode(phoneNumber);
    } catch {
      await this.deletePendingRegistrationQuietly(phoneNumber);
      this.logger.warn('Registration OTP delivery failed.');
    }

    return this.createRegistrationAcknowledgement();
  }

  async resendRegistrationOtp(
    dto: ResendRegistrationOtpDto,
    ipAddress: string,
  ) {
    const phoneNumber = normalizePhoneNumber(dto.phoneNumber);

    await this.otpSecurityService.consumeSend(phoneNumber, ipAddress);

    const pendingRegistration =
      await this.pendingRegistrationStore.findByPhoneNumber(phoneNumber);

    if (!pendingRegistration) {
      return this.createRegistrationAcknowledgement();
    }

    try {
      await this.otpService.requestCode(phoneNumber);
      await this.pendingRegistrationStore.save(pendingRegistration);
    } catch {
      this.logger.warn('Registration OTP resend failed.');
    }

    return this.createRegistrationAcknowledgement();
  }

  async verifyRegistration(dto: VerifyRegistrationDto) {
    const phoneNumber = normalizePhoneNumber(dto.phoneNumber);
    const pendingRegistration =
      await this.pendingRegistrationStore.findByPhoneNumber(phoneNumber);

    if (!pendingRegistration) {
      this.throwInvalidOrExpiredOtp();
    }

    const attempt =
      await this.otpSecurityService.consumeVerificationAttempt(phoneNumber);
    const approved = await this.otpService.verifyCode(phoneNumber, dto.code);

    if (!approved) {
      if (attempt.isFinalAttempt) {
        await this.deletePendingRegistrationQuietly(phoneNumber);
      }

      this.throwInvalidOrExpiredOtp();
    }

    try {
      await this.usersService.create({
        firstName: pendingRegistration.firstName,
        lastName: pendingRegistration.lastName,
        email: pendingRegistration.email,
        phoneNumber: pendingRegistration.phoneNumber,
        passwordHash: pendingRegistration.passwordHash,
        phoneVerified: true,
      });
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        await this.cleanupCompletedRegistration(phoneNumber);
        this.throwRegistrationConflict();
      }

      throw error;
    }

    await this.cleanupCompletedRegistration(phoneNumber);

    return {
      message: 'Kayıt başarıyla tamamlandı.',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.phoneVerified) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        code: 'PHONE_VERIFICATION_REQUIRED',
        message: 'Telefon doğrulaması gerekiyor.',
      });
    }

    const device = await this.devicesService.registerOrUpdate(user.userId, {
      installationId: dto.installationId,
      platform: dto.platform,
      deviceName: dto.deviceName,
      pushToken: dto.pushToken,
    });

    const tokens = await this.generateTokens(user.userId);

    await this.saveRefreshToken(device.deviceId, tokens.refreshToken);

    return {
      user: {
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    let payload: {
      sub?: unknown;
    };

    try {
      payload = await this.jwtService.verifyAsync<{
        sub?: unknown;
      }>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (typeof payload.sub !== 'string' || !isUUID(payload.sub, '4')) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const userId = payload.sub;

    const rotation = await this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const storedToken = await transaction.refreshToken.findFirst({
        where: {
          tokenHash: hashToken(refreshToken),
          device: {
            userId,
          },
        },
        include: {
          device: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!storedToken) {
        return null;
      }

      if (storedToken.revokedAt || !storedToken.device.isActive) {
        if (storedToken.device.isActive) {
          await this.revokeDeviceSession(
            transaction,
            userId,
            storedToken.deviceId,
            now,
          );
        }

        return null;
      }

      if (storedToken.expiresAt <= now) {
        return null;
      }

      const consumedToken = await transaction.refreshToken.updateMany({
        where: {
          refreshTokenId: storedToken.refreshTokenId,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          revokedAt: now,
        },
      });

      if (consumedToken.count !== 1) {
        await this.revokeDeviceSession(
          transaction,
          userId,
          storedToken.deviceId,
          now,
        );

        return null;
      }

      const tokens = await this.generateTokens(userId);

      await transaction.refreshToken.create({
        data: this.createRefreshTokenData(
          storedToken.deviceId,
          tokens.refreshToken,
        ),
      });

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        platform: storedToken.device.platform,
      };
    });

    if (!rotation) {
      throw new UnauthorizedException('Refresh token is invalid or revoked.');
    }

    return rotation;
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);

    await this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const storedToken = await transaction.refreshToken.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
          device: {
            isActive: true,
          },
        },
        select: {
          deviceId: true,
          device: {
            select: {
              userId: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!storedToken) {
        return;
      }

      await this.revokeDeviceSession(
        transaction,
        storedToken.device.userId,
        storedToken.deviceId,
        now,
      );
    });

    return {
      message: 'Logout successful.',
    };
  }

  private throwInvalidOrExpiredOtp(): never {
    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'OTP_INVALID_OR_EXPIRED',
      message: 'Doğrulama kodu geçersiz veya süresi dolmuş.',
    });
  }

  private throwRegistrationConflict(): never {
    throw new ConflictException({
      statusCode: HttpStatus.CONFLICT,
      code: 'REGISTRATION_ALREADY_EXISTS',
      message: 'Kayıt işlemi tamamlanamadı.',
    });
  }

  private createRegistrationAcknowledgement() {
    return {
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: this.pendingRegistrationStore.getExpiresInSeconds(),
    };
  }

  private async cleanupCompletedRegistration(
    phoneNumber: string,
  ): Promise<void> {
    const results = await Promise.allSettled([
      this.pendingRegistrationStore.delete(phoneNumber),
      this.otpSecurityService.clearVerificationAttempts(phoneNumber),
    ]);

    if (results.some((result) => result.status === 'rejected')) {
      this.logger.warn('Completed registration cleanup failed.');
    }
  }

  private async deletePendingRegistrationQuietly(
    phoneNumber: string,
  ): Promise<void> {
    try {
      await this.pendingRegistrationStore.delete(phoneNumber);
    } catch {
      this.logger.warn('Pending registration cleanup failed.');
    }
  }

  private async saveRefreshToken(deviceId: string, refreshToken: string) {
    return this.prisma.refreshToken.create({
      data: this.createRefreshTokenData(deviceId, refreshToken),
    });
  }

  private createRefreshTokenData(deviceId: string, refreshToken: string) {
    const refreshTokenExpiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );

    const expiresAt = new Date(
      Date.now() + this.parseDuration(refreshTokenExpiresIn),
    );

    return {
      deviceId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    };
  }

  private async revokeDeviceSession(
    transaction: Prisma.TransactionClient,
    userId: string,
    deviceId: string,
    revokedAt: Date,
  ): Promise<void> {
    await transaction.refreshToken.updateMany({
      where: {
        deviceId,
        revokedAt: null,
      },
      data: {
        revokedAt,
      },
    });

    await transaction.device.updateMany({
      where: {
        deviceId,
        userId,
      },
      data: {
        isActive: false,
        pushToken: null,
        pushTokenHash: null,
      },
    });
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)\s*(s|m|h|d)$/);

    if (!match) {
      throw new Error('JWT_REFRESH_EXPIRES_IN geçerli bir formatta değil.');
    }

    const value = Number(match[1]);
    const unit = match[2];

    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * multipliers[unit];
  }

  private async generateTokens(userId: string) {
    const accessTokenPayload = {
      sub: userId,
    } as const;
    const refreshTokenPayload = {
      sub: userId,
      jti: randomUUID(),
    } as const;

    const accessToken = await this.jwtService.signAsync(accessTokenPayload);

    const refreshToken = await this.jwtService.signAsync(refreshTokenPayload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async getMe(userId: string) {
    return this.usersService.findById(userId);
  }
}
