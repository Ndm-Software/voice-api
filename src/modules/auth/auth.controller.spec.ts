import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';

import { PlatformType } from '../../generated/prisma/enums';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    resendRegistrationOtp: jest.Mock;
    verifyRegistration: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };
  let response: Response;
  let cookie: jest.Mock;
  let clearCookie: jest.Mock;
  let configService: { get: jest.Mock };

  const tokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  };

  const loginDto = (
    platform: (typeof PlatformType)[keyof typeof PlatformType],
  ) =>
    ({
      email: 'user@example.com',
      password: 'password123',
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      platform,
      deviceName: 'Test Device',
    }) satisfies LoginDto;

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      resendRegistrationOtp: jest.fn(),
      verifyRegistration: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    };
    cookie = jest.fn();
    clearCookie = jest.fn();
    response = { cookie, clearCookie } as unknown as Response;
    configService = { get: jest.fn().mockReturnValue('test') };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('returns only the pending registration acknowledgement', async () => {
    const dto = {
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      phoneNumber: '+905551112233',
      password: 'password123',
    };
    const acknowledgement = {
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    };
    authService.register.mockResolvedValue(acknowledgement);

    await expect(controller.register(dto, '203.0.113.10')).resolves.toEqual(
      acknowledgement,
    );
    expect(authService.register).toHaveBeenCalledWith(dto, '203.0.113.10');
  });

  it('forwards registration resend with the client IP', async () => {
    const acknowledgement = {
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    };
    authService.resendRegistrationOtp.mockResolvedValue(acknowledgement);

    await expect(
      controller.resendRegistrationOtp(
        { phoneNumber: '+905551112233' },
        '203.0.113.10',
      ),
    ).resolves.toEqual(acknowledgement);
    expect(authService.resendRegistrationOtp).toHaveBeenCalledWith(
      { phoneNumber: '+905551112233' },
      '203.0.113.10',
    );
  });

  it('forwards registration verification without issuing tokens', async () => {
    const acknowledgement = { message: 'Kayıt başarıyla tamamlandı.' };
    authService.verifyRegistration.mockResolvedValue(acknowledgement);

    await expect(
      controller.verifyRegistration({
        phoneNumber: '+905551112233',
        code: '123456',
      }),
    ).resolves.toEqual(acknowledgement);
    expect(cookie).not.toHaveBeenCalled();
  });

  it('stores web login tokens only in HttpOnly cookies', async () => {
    authService.login.mockResolvedValue(tokens);

    const result = await controller.login(loginDto(PlatformType.WEB), response);

    expect(cookie).toHaveBeenCalledTimes(2);
    expect(cookie).toHaveBeenNthCalledWith(
      1,
      'accessToken',
      tokens.accessToken,
      expect.objectContaining({ httpOnly: true, secure: false }),
    );
    expect(cookie).toHaveBeenNthCalledWith(
      2,
      'refreshToken',
      tokens.refreshToken,
      expect.objectContaining({ httpOnly: true, secure: false }),
    );
    expect(result).toEqual({ message: 'Login successful.' });
  });

  it('sets secure cookies in the normalized production environment', async () => {
    configService.get.mockReturnValue('production');
    authService.login.mockResolvedValue(tokens);

    await controller.login(loginDto(PlatformType.WEB), response);

    expect(cookie).toHaveBeenNthCalledWith(
      1,
      'accessToken',
      tokens.accessToken,
      expect.objectContaining({ secure: true }),
    );
    expect(cookie).toHaveBeenNthCalledWith(
      2,
      'refreshToken',
      tokens.refreshToken,
      expect.objectContaining({ secure: true }),
    );
  });

  it.each([PlatformType.ANDROID, PlatformType.IOS, PlatformType.WINDOWS])(
    'returns %s login tokens in the JSON body without setting cookies',
    async (platform) => {
      authService.login.mockResolvedValue(tokens);

      const result = await controller.login(loginDto(platform), response);

      expect(cookie).not.toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Login successful.',
        ...tokens,
      });
    },
  );

  it('keeps refreshed web tokens out of the response body', async () => {
    authService.refresh.mockResolvedValue({
      ...tokens,
      platform: PlatformType.WEB,
    });
    const request = {
      cookies: { refreshToken: 'old-refresh-token' },
    } as unknown as Request;

    const result = await controller.refresh(request, response, {});

    expect(authService.refresh).toHaveBeenCalledWith('old-refresh-token');
    expect(cookie).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ message: 'Token refreshed successfully.' });
  });

  it('returns refreshed native tokens in the JSON body', async () => {
    authService.refresh.mockResolvedValue({
      ...tokens,
      platform: PlatformType.IOS,
    });
    const request = { cookies: {} } as Request;

    const result = await controller.refresh(
      request,
      response,
      {},
      'bearer old-refresh-token',
    );

    expect(authService.refresh).toHaveBeenCalledWith('old-refresh-token');
    expect(cookie).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Token refreshed successfully.',
      ...tokens,
    });
  });

  it('rejects refresh requests without a token', async () => {
    const request = { cookies: {} } as Request;

    await expect(
      controller.refresh(request, response, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
