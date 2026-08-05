import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Request, Response } from 'express';

import { UsersService } from '../modules/users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Yeni kullanıcı kaydı oluşturur.
   *
   * Şifre bcrypt ile hashlenir ve kullanıcı
   * oluşturma işlemi UsersService'e devredilir.
   */
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

  /**
   * Email ve şifre doğrulandıktan sonra
   * Access Token ve Refresh Token üretilir.
   */
  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatch = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.generateTokens(user.userId, user.email);
  }

  /**
   * Refresh token kullanılarak
   * yeni Access ve Refresh Token üretir.
   * Tokenlar tekrar HttpOnly Cookie içerisine yazılır.
   */
  async refresh(req: Request, res: Response) {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found.');
    }

    const payload = await this.jwtService.verifyAsync<{
      sub: number;
      email: string;
    }>(refreshToken, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });

    const tokens = await this.generateTokens(payload.sub, payload.email);

    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      message: 'Token refreshed successfully.',
    };
  }

  /**
   * Kullanıcının oturumunu sonlandırır.
   *
   * Access ve Refresh Token cookie'lerini temizler.
   */
  logout(res: Response) {
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });

    return {
      message: 'Logout successful.',
    };
  }

  private async generateTokens(userId: number, email: string) {
    const payload = {
      sub: userId,
      email,
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
