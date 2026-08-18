import { createHash } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { isUUID } from 'class-validator';

import { Prisma } from '../../generated/prisma/client';
import { PlatformType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { OtpService } from '../otp/otp.service';
import { OtpSecurityService } from '../otp/otp-security.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PendingRegistrationStore } from './pending-registration.store';

type RunTransaction = (
  callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
) => Promise<unknown>;

type RefreshTokenUpdateManyInput = {
  where: {
    refreshTokenId?: string;
    deviceId?: string;
    revokedAt: null;
    expiresAt?: {
      gt: Date;
    };
  };
  data: {
    revokedAt: Date;
  };
};

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    findByPhoneNumber: jest.Mock;
    create: jest.Mock;
  };
  let devicesService: { registerOrUpdate: jest.Mock };
  let pendingRegistrationStore: {
    save: jest.Mock;
    delete: jest.Mock;
    getExpiresInSeconds: jest.Mock;
    findByPhoneNumber: jest.Mock;
  };
  let otpService: { requestCode: jest.Mock; verifyCode: jest.Mock };
  let otpSecurityService: {
    consumeSend: jest.Mock;
    consumeVerificationAttempt: jest.Mock;
    clearVerificationAttempts: jest.Mock;
  };
  let refreshToken: {
    create: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  let deviceUpdateMany: jest.Mock;
  let runTransaction: jest.MockedFunction<RunTransaction>;
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let passwordHash: string;
  let createdRefreshTokenInput: unknown;

  const userId = '6b11643d-77d7-4fd9-81a8-43c51e07f7b0';
  const deviceId = 'a25e1cbf-6304-4c69-84f7-d43189375d03';
  const dto: LoginDto = {
    email: 'user@example.com',
    password: 'password123',
    installationId: '550e8400-e29b-41d4-a716-446655440000',
    platform: PlatformType.IOS,
    deviceName: 'iPhone',
  };
  const registerDto: RegisterDto = {
    firstName: ' Test ',
    lastName: ' User ',
    email: ' USER@EXAMPLE.COM ',
    phoneNumber: '05551112233',
    password: 'password123',
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(dto.password, 4);
  });

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findByPhoneNumber: jest.fn(),
      create: jest.fn(),
    };
    devicesService = { registerOrUpdate: jest.fn() };
    pendingRegistrationStore = {
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      getExpiresInSeconds: jest.fn().mockReturnValue(600),
      findByPhoneNumber: jest.fn(),
    };
    otpService = {
      requestCode: jest.fn().mockResolvedValue(undefined),
      verifyCode: jest.fn(),
    };
    otpSecurityService = {
      consumeSend: jest.fn().mockResolvedValue(undefined),
      consumeVerificationAttempt: jest
        .fn()
        .mockResolvedValue({ isFinalAttempt: false }),
      clearVerificationAttempts: jest.fn().mockResolvedValue(undefined),
    };
    createdRefreshTokenInput = undefined;
    refreshToken = {
      create: jest.fn((input: unknown) => {
        createdRefreshTokenInput = input;
      }),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    deviceUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      refreshToken,
      device: {
        updateMany: deviceUpdateMany,
      },
    } as unknown as Prisma.TransactionClient;
    const executeTransaction: RunTransaction = (callback) =>
      callback(transaction);
    runTransaction = jest.fn(executeTransaction);
    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: DevicesService, useValue: devicesService },
        {
          provide: PrismaService,
          useValue: { refreshToken, $transaction: runTransaction },
        },
        { provide: JwtService, useValue: jwtService },
        {
          provide: PendingRegistrationStore,
          useValue: pendingRegistrationStore,
        },
        { provide: OtpService, useValue: otpService },
        { provide: OtpSecurityService, useValue: otpSecurityService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
              if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
              throw new Error(`Unexpected config key: ${key}`);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('stores a pending registration and requests OTP without creating a user', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.findByPhoneNumber.mockResolvedValue(null);

    await expect(
      service.register(registerDto, '203.0.113.10'),
    ).resolves.toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    });

    expect(usersService.findByEmail.mock.calls).toEqual([['user@example.com']]);
    expect(usersService.findByPhoneNumber.mock.calls).toEqual([
      ['+905551112233'],
    ]);
    expect(pendingRegistrationStore.save).toHaveBeenCalledTimes(1);
    expect(otpSecurityService.consumeSend).toHaveBeenCalledWith(
      '+905551112233',
      '203.0.113.10',
    );
    const saveCalls = pendingRegistrationStore.save.mock.calls as unknown[][];
    const storedRegistration = saveCalls[0][0] as {
      firstName: string;
      lastName: string;
      email: string;
      phoneNumber: string;
      passwordHash: string;
      createdAt: string;
    };
    expect(storedRegistration).toMatchObject({
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      phoneNumber: '+905551112233',
    });
    expect(storedRegistration.passwordHash).not.toBe(registerDto.password);
    await expect(
      bcrypt.compare(registerDto.password, storedRegistration.passwordHash),
    ).resolves.toBe(true);
    expect(Number.isNaN(Date.parse(storedRegistration.createdAt))).toBe(false);
    expect(otpService.requestCode).toHaveBeenCalledWith('+905551112233');
  });

  it.each(['email', 'phone'] as const)(
    'does not expose an existing %s or send an OTP',
    async (existingField) => {
      usersService.findByEmail.mockResolvedValue(
        existingField === 'email' ? { userId } : null,
      );
      usersService.findByPhoneNumber.mockResolvedValue(
        existingField === 'phone' ? { userId } : null,
      );

      await expect(
        service.register(registerDto, '203.0.113.10'),
      ).resolves.toEqual({
        message: 'Doğrulama kodu gönderildi.',
        expiresInSeconds: 600,
      });

      expect(otpSecurityService.consumeSend).toHaveBeenCalledWith(
        '+905551112233',
        '203.0.113.10',
      );
      expect(pendingRegistrationStore.save).not.toHaveBeenCalled();
      expect(otpService.requestCode).not.toHaveBeenCalled();
    },
  );

  it('hides provider failure and removes incomplete pending data', async () => {
    const providerError = new Error('provider unavailable');
    usersService.findByEmail.mockResolvedValue(null);
    usersService.findByPhoneNumber.mockResolvedValue(null);
    otpService.requestCode.mockRejectedValue(providerError);

    await expect(
      service.register(registerDto, '203.0.113.10'),
    ).resolves.toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    });

    expect(pendingRegistrationStore.delete).toHaveBeenCalledWith(
      '+905551112233',
    );
  });

  it('hides pending storage failure without requesting OTP', async () => {
    const redisError = new Error('redis unavailable');
    usersService.findByEmail.mockResolvedValue(null);
    usersService.findByPhoneNumber.mockResolvedValue(null);
    pendingRegistrationStore.save.mockRejectedValue(redisError);

    await expect(
      service.register(registerDto, '203.0.113.10'),
    ).resolves.toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    });

    expect(otpService.requestCode).not.toHaveBeenCalled();
    expect(pendingRegistrationStore.delete).toHaveBeenCalledWith(
      '+905551112233',
    );
  });

  it('resends OTP only for an active pending registration', async () => {
    pendingRegistrationStore.findByPhoneNumber.mockResolvedValue({
      phoneNumber: '+905551112233',
    });

    await expect(
      service.resendRegistrationOtp(
        { phoneNumber: '05551112233' },
        '203.0.113.10',
      ),
    ).resolves.toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    });
    expect(otpSecurityService.consumeSend).toHaveBeenCalledWith(
      '+905551112233',
      '203.0.113.10',
    );
    expect(pendingRegistrationStore.save).toHaveBeenCalledWith({
      phoneNumber: '+905551112233',
    });
    expect(otpService.requestCode).toHaveBeenCalledWith('+905551112233');
  });

  it('does not expose an expired pending registration during resend', async () => {
    pendingRegistrationStore.findByPhoneNumber.mockResolvedValue(null);

    await expect(
      service.resendRegistrationOtp(
        { phoneNumber: '+905551112233' },
        '203.0.113.10',
      ),
    ).resolves.toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    });
    expect(otpSecurityService.consumeSend).toHaveBeenCalledWith(
      '+905551112233',
      '203.0.113.10',
    );
    expect(otpService.requestCode).not.toHaveBeenCalled();
  });

  it('hides provider failure during an active registration resend', async () => {
    pendingRegistrationStore.findByPhoneNumber.mockResolvedValue({
      phoneNumber: '+905551112233',
    });
    otpService.requestCode.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      service.resendRegistrationOtp(
        { phoneNumber: '+905551112233' },
        '203.0.113.10',
      ),
    ).resolves.toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    });
    expect(pendingRegistrationStore.save).not.toHaveBeenCalled();
  });

  it('rejects verification when pending registration has expired', async () => {
    pendingRegistrationStore.findByPhoneNumber.mockResolvedValue(null);

    await expect(
      service.verifyRegistration({
        phoneNumber: '+905551112233',
        code: '123456',
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: 'OTP_INVALID_OR_EXPIRED',
        message: 'Doğrulama kodu geçersiz veya süresi dolmuş.',
      },
    });
    expect(
      otpSecurityService.consumeVerificationAttempt,
    ).not.toHaveBeenCalled();
    expect(otpService.verifyCode).not.toHaveBeenCalled();
  });

  it('keeps pending registration after a non-final invalid code', async () => {
    pendingRegistrationStore.findByPhoneNumber.mockResolvedValue({
      phoneNumber: '+905551112233',
    });
    otpService.verifyCode.mockResolvedValue(false);

    await expect(
      service.verifyRegistration({
        phoneNumber: '+905551112233',
        code: '000000',
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: 'OTP_INVALID_OR_EXPIRED',
        message: 'Doğrulama kodu geçersiz veya süresi dolmuş.',
      },
    });
    expect(pendingRegistrationStore.delete).not.toHaveBeenCalled();
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('removes pending registration after the final invalid code', async () => {
    pendingRegistrationStore.findByPhoneNumber.mockResolvedValue({
      phoneNumber: '+905551112233',
    });
    otpSecurityService.consumeVerificationAttempt.mockResolvedValue({
      isFinalAttempt: true,
    });
    otpService.verifyCode.mockResolvedValue(false);

    await expect(
      service.verifyRegistration({
        phoneNumber: '+905551112233',
        code: '000000',
      }),
    ).rejects.toBeDefined();
    expect(pendingRegistrationStore.delete).toHaveBeenCalledWith(
      '+905551112233',
    );
  });

  it('creates a verified user without login tokens after valid OTP', async () => {
    pendingRegistrationStore.findByPhoneNumber.mockResolvedValue({
      version: 1,
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      phoneNumber: '+905551112233',
      passwordHash: 'bcrypt-hash',
      createdAt: '2026-08-13T10:00:00.000Z',
    });
    otpService.verifyCode.mockResolvedValue(true);
    usersService.create.mockResolvedValue({ userId });

    await expect(
      service.verifyRegistration({
        phoneNumber: '05551112233',
        code: '123456',
      }),
    ).resolves.toEqual({
      message: 'Kayıt başarıyla tamamlandı.',
    });
    expect(usersService.create).toHaveBeenCalledWith({
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      phoneNumber: '+905551112233',
      passwordHash: 'bcrypt-hash',
      phoneVerified: true,
    });
    expect(pendingRegistrationStore.delete).toHaveBeenCalledWith(
      '+905551112233',
    );
    expect(otpSecurityService.clearVerificationAttempts).toHaveBeenCalledWith(
      '+905551112233',
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
    expect(devicesService.registerOrUpdate).not.toHaveBeenCalled();
  });

  it('cleans pending state and returns a stable conflict after a uniqueness race', async () => {
    pendingRegistrationStore.findByPhoneNumber.mockResolvedValue({
      version: 1,
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      phoneNumber: '+905551112233',
      passwordHash: 'bcrypt-hash',
      createdAt: '2026-08-13T10:00:00.000Z',
    });
    otpService.verifyCode.mockResolvedValue(true);
    usersService.create.mockRejectedValue(new ConflictException('duplicate'));

    await expect(
      service.verifyRegistration({
        phoneNumber: '+905551112233',
        code: '123456',
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: 'REGISTRATION_ALREADY_EXISTS',
        message: 'Kayıt işlemi tamamlanamadı.',
      },
    });
    expect(pendingRegistrationStore.delete).toHaveBeenCalled();
    expect(otpSecurityService.clearVerificationAttempts).toHaveBeenCalled();
  });

  it('uses the same error for an unknown email and an invalid password', async () => {
    usersService.findByEmail.mockResolvedValueOnce(null);

    await expect(service.login(dto)).rejects.toThrow(
      new UnauthorizedException('Invalid email or password.'),
    );

    usersService.findByEmail.mockResolvedValueOnce({
      userId,
      email: dto.email,
      passwordHash,
      phoneVerified: true,
    });

    await expect(
      service.login({ ...dto, password: 'wrong-password' }),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password.'));
    expect(devicesService.registerOrUpdate).not.toHaveBeenCalled();
  });

  it('rejects an unverified phone only after valid credentials', async () => {
    usersService.findByEmail.mockResolvedValue({
      userId,
      email: dto.email,
      passwordHash,
      phoneVerified: false,
    });

    await expect(service.login(dto)).rejects.toBeInstanceOf(ForbiddenException);

    try {
      await service.login(dto);
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toEqual({
        statusCode: 403,
        code: 'PHONE_VERIFICATION_REQUIRED',
        message: 'Telefon doğrulaması gerekiyor.',
      });
    }

    expect(devicesService.registerOrUpdate).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
    expect(refreshToken.create).not.toHaveBeenCalled();
  });

  it('creates the device and hashed refresh token after verified login', async () => {
    usersService.findByEmail.mockResolvedValue({
      userId,
      firstName: 'Test',
      lastName: 'User',
      email: dto.email,
      phoneNumber: '+905551112233',
      passwordHash,
      phoneVerified: true,
    });
    devicesService.registerOrUpdate.mockResolvedValue({ deviceId });

    const result = await service.login(dto);

    expect(devicesService.registerOrUpdate).toHaveBeenCalledWith(userId, {
      installationId: dto.installationId,
      platform: dto.platform,
      deviceName: dto.deviceName,
      pushToken: undefined,
    });
    const createdExpiresAt = (
      createdRefreshTokenInput as { data: { expiresAt: unknown } }
    ).data.expiresAt;

    expect(createdExpiresAt).toBeInstanceOf(Date);
    expect(createdRefreshTokenInput).toEqual({
      data: {
        deviceId,
        tokenHash: createHash('sha256')
          .update('refresh-token', 'utf8')
          .digest('hex'),
        expiresAt: createdExpiresAt,
      },
    });
    expect(result).toEqual({
      user: {
        userId,
        firstName: 'Test',
        lastName: 'User',
        email: dto.email,
        phoneNumber: '+905551112233',
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  it('returns the stored device platform when refreshing tokens', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: userId,
      email: dto.email,
    });
    refreshToken.findFirst.mockResolvedValue({
      refreshTokenId: '6fff5cf4-cb2c-4802-bdce-406d12f23cb4',
      deviceId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      device: {
        userId,
        isActive: true,
        platform: PlatformType.WINDOWS,
      },
    });

    const result = await service.refresh('old-refresh-token');

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      platform: PlatformType.WINDOWS,
    });
    expect(runTransaction).toHaveBeenCalledTimes(1);
    const updateManyCalls = refreshToken.updateMany.mock
      .calls as unknown as Array<[RefreshTokenUpdateManyInput]>;
    const consumeInput = updateManyCalls[0][0];
    expect(consumeInput.where.refreshTokenId).toBe(
      '6fff5cf4-cb2c-4802-bdce-406d12f23cb4',
    );
    expect(consumeInput.where.revokedAt).toBeNull();
    expect(consumeInput.where.expiresAt?.gt).toBeInstanceOf(Date);
    expect(consumeInput.data.revokedAt).toBeInstanceOf(Date);
    const signCalls = jwtService.signAsync.mock.calls as unknown as Array<
      [unknown, unknown?]
    >;
    const refreshPayload = signCalls[1][0] as {
      sub: string;
      jti: string;
    };
    expect(refreshPayload.sub).toBe(userId);
    expect(isUUID(refreshPayload.jti, '4')).toBe(true);
  });

  it('revokes the device session when concurrent refresh consumption loses the race', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: userId });
    refreshToken.findFirst.mockResolvedValue({
      refreshTokenId: '6fff5cf4-cb2c-4802-bdce-406d12f23cb4',
      deviceId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      device: {
        userId,
        isActive: true,
        platform: PlatformType.WINDOWS,
      },
    });
    refreshToken.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(service.refresh('old-refresh-token')).rejects.toThrow(
      new UnauthorizedException('Refresh token is invalid or revoked.'),
    );

    expect(refreshToken.create).not.toHaveBeenCalled();
    expect(deviceUpdateMany).toHaveBeenCalledWith({
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
  });

  it('revokes the active device session when a rotated token is reused', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: userId });
    refreshToken.findFirst.mockResolvedValue({
      refreshTokenId: '6fff5cf4-cb2c-4802-bdce-406d12f23cb4',
      deviceId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      device: {
        userId,
        isActive: true,
        platform: PlatformType.WINDOWS,
      },
    });

    await expect(service.refresh('reused-refresh-token')).rejects.toThrow(
      new UnauthorizedException('Refresh token is invalid or revoked.'),
    );

    expect(refreshToken.create).not.toHaveBeenCalled();
    expect(deviceUpdateMany).toHaveBeenCalledWith({
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
  });

  it('revokes all device tokens and clears push data on logout', async () => {
    refreshToken.findFirst.mockResolvedValue({
      deviceId,
      device: {
        userId,
      },
    });

    await expect(service.logout('old-refresh-token')).resolves.toEqual({
      message: 'Logout successful.',
    });

    const updateManyCalls = refreshToken.updateMany.mock
      .calls as unknown as Array<[RefreshTokenUpdateManyInput]>;
    const revokeInput = updateManyCalls[0][0];
    expect(revokeInput.where).toEqual({
      deviceId,
      revokedAt: null,
    });
    expect(revokeInput.data.revokedAt).toBeInstanceOf(Date);
    expect(deviceUpdateMany).toHaveBeenCalledWith({
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
  });

  it.each([{}, { sub: 42 }, { sub: '42' }, { sub: 'not-a-uuid' }])(
    'rejects a refresh token with a non-UUID subject',
    async (payload) => {
      jwtService.verifyAsync.mockResolvedValue(payload);

      await expect(service.refresh('old-refresh-token')).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token.'),
      );
      expect(refreshToken.findFirst).not.toHaveBeenCalled();
    },
  );
});
