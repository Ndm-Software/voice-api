import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  PlatformType,
  type PlatformType as PlatformTypeValue,
} from '../../generated/prisma/enums';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendRegistrationOtpDto } from './dto/resend-registration-otp.dto';
import { VerifyRegistrationDto } from './dto/verify-registration.dto';
import { createHash } from 'node:crypto';
import { RedisService } from '../../integrations/redis/redis.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Ip() ipAddress: string) {
    return this.authService.register(dto, ipAddress);
  }

  @Post('register/resend')
  resendRegistrationOtp(
    @Body() dto: ResendRegistrationOtpDto,
    @Ip() ipAddress: string,
  ) {
    return this.authService.resendRegistrationOtp(dto, ipAddress);
  }

  @Post('register/verify')
  verifyRegistration(@Body() dto: VerifyRegistrationDto) {
    return this.authService.verifyRegistration(dto);
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Ip() ipAddress: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    await this.checkLoginRateLimit(normalizedEmail, ipAddress);

    try {
      const result = await this.authService.login(dto);

      if (dto.platform === PlatformType.WEB) {
        this.setAuthCookies(res, result);

        return { message: 'Login successful.' };
      }

      return this.createNativeTokenResponse('Login successful.', result);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.recordFailedLogin(normalizedEmail, ipAddress);
      }

      throw error;
    }
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: RefreshTokenDto,
    @Headers('authorization') authorization?: string,
  ) {
    const cookieRefreshToken = this.readRefreshTokenCookie(req);

    const bearerRefreshToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    const refreshToken =
      cookieRefreshToken ||
      this.readToken(dto.refreshToken) ||
      this.readToken(bearerRefreshToken);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    const result = await this.authService.refresh(refreshToken);

    if (result.platform === PlatformType.WEB) {
      this.setAuthCookies(res, result);

      return { message: 'Token refreshed successfully.' };
    }

    return this.createNativeTokenResponse(
      'Token refreshed successfully.',
      result,
    );
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: RefreshTokenDto,
  ) {
    const refreshToken =
      this.readRefreshTokenCookie(req) || this.readToken(dto.refreshToken);

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return {
      message: 'Logout successful.',
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.userId);
  }

  private static readonly LOGIN_RATE_LIMIT = 5;
  private static readonly LOGIN_RATE_LIMIT_TTL_SECONDS = 15 * 60;

  private async checkLoginRateLimit(
    email: string,
    ipAddress: string,
  ): Promise<void> {
    try {
      const emailKey = this.createLoginRateLimitKey('email', email);
      const ipKey = this.createLoginRateLimitKey('ip', ipAddress);

      const [emailCount, ipCount] = await Promise.all([
        this.redisService.get(emailKey),
        this.redisService.get(ipKey),
      ]);

      const emailAttempts = Number(emailCount ?? 0);
      const ipAttempts = Number(ipCount ?? 0);

      if (
        emailAttempts >= AuthController.LOGIN_RATE_LIMIT ||
        ipAttempts >= AuthController.LOGIN_RATE_LIMIT
      ) {
        throw new HttpException(
          'Too many login attempts. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        throw error;
      }

      // Redis rate limiter kullanılamıyorsa da  login akışını bozulmasın diye.
    }
  }

  private async recordFailedLogin(
    email: string,
    ipAddress: string,
  ): Promise<void> {
    try {
      const emailKey = this.createLoginRateLimitKey('email', email);
      const ipKey = this.createLoginRateLimitKey('ip', ipAddress);

      await Promise.all([
        this.redisService.incrementWithExpiry(
          emailKey,
          AuthController.LOGIN_RATE_LIMIT_TTL_SECONDS,
        ),
        this.redisService.incrementWithExpiry(
          ipKey,
          AuthController.LOGIN_RATE_LIMIT_TTL_SECONDS,
        ),
      ]);
    } catch {
      // Redis rate limiter hatası login işlemini bozmasın.
    }
  }

  private createLoginRateLimitKey(type: 'email' | 'ip', value: string): string {
    const hash = createHash('sha256').update(value).digest('hex');

    return `auth:login:rate-limit:${type}:${hash}`;
  }

  private setAuthCookies(
    response: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    const secure =
      this.configService.get<string>('app.environment') === 'production';

    response.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    response.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private createNativeTokenResponse(
    message: string,
    tokens: {
      accessToken: string;
      refreshToken: string;
      platform?: PlatformTypeValue;
    },
  ) {
    return {
      message,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  private readRefreshTokenCookie(request: Request): string | undefined {
    const cookies: unknown = request.cookies;

    if (!cookies || typeof cookies !== 'object') {
      return undefined;
    }

    const refreshToken: unknown = (cookies as Record<string, unknown>)[
      'refreshToken'
    ];

    return this.readToken(refreshToken);
  }

  private readToken(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const token = value.trim();

    return token.length > 0 ? token : undefined;
  }
}
