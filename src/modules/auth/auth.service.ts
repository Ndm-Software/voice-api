import { createHash } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { DevicesService } from '../devices/devices.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly devicesService: DevicesService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      passwordHash,
    });

    return {
      message: 'User registered successfully.',
      user,
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
      sub: string;
    };

    try {
      payload = await this.jwtService.verifyAsync<{
        sub: string;
      }>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const tokenHash = hashToken(refreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
        device: {
          userId: payload.sub,
          isActive: true,
        },
      },
      include: {
        device: true,
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token is invalid or revoked.');
    }

    await this.prisma.refreshToken.update({
      where: {
        refreshTokenId: storedToken.refreshTokenId,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    const tokens = await this.generateTokens(payload.sub);

    await this.saveRefreshToken(storedToken.deviceId, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      message: 'Logout successful.',
    };
  }

  private async saveRefreshToken(deviceId: string, refreshToken: string) {
    const refreshTokenExpiresIn = this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');

    const expiresAt = new Date(
      Date.now() + this.parseDuration(refreshTokenExpiresIn),
    );

    return this.prisma.refreshToken.create({
      data: {
        deviceId,
        tokenHash: hashToken(refreshToken),
        expiresAt,
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
    const payload = {
      sub: userId,
    } as const;

    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}
