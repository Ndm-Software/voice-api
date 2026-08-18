import {
  Body,
  Controller,
  Get,
  Headers,
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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
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
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    if (dto.platform === PlatformType.WEB) {
      this.setAuthCookies(res, result);

      return { message: 'Login successful.' };
    }

    return this.createNativeTokenResponse('Login successful.', result);
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
