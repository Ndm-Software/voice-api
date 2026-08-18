import { Server } from 'node:http';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import {
  PendingRegistration,
  PendingRegistrationStore,
} from '../src/modules/auth/pending-registration.store';
import { DevicesService } from '../src/modules/devices/devices.service';
import { OTP_PROVIDER } from '../src/modules/otp/contracts/otp-provider.interface';
import { OtpSecurityService } from '../src/modules/otp/otp-security.service';
import { OtpService } from '../src/modules/otp/otp.service';
import { FakeOtpProvider } from '../src/modules/otp/testing/fake-otp.provider';
import { UsersService } from '../src/modules/users/users.service';
import { PrismaService } from '../src/prisma/prisma.service';

const isHttpServer = (value: unknown): value is Server =>
  value instanceof Server;

class ControllableFakeOtpProvider extends FakeOtpProvider {
  rejectRequests = false;

  requestCode(phoneNumber: string): Promise<void> {
    if (this.rejectRequests) {
      return Promise.reject(new Error('provider unavailable'));
    }

    return super.requestCode(phoneNumber);
  }
}

describe('Auth registration flow', () => {
  let app: INestApplication;
  let httpServer: Server;
  let pendingRegistration: PendingRegistration | null;
  let createdUserInput: unknown;
  let signAsync: jest.Mock;
  let registerOrUpdate: jest.Mock;
  let otpProvider: ControllableFakeOtpProvider;

  beforeEach(async () => {
    pendingRegistration = null;
    createdUserInput = undefined;
    signAsync = jest.fn();
    registerOrUpdate = jest.fn();
    otpProvider = new ControllableFakeOtpProvider('123456');

    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn((email: string) =>
              Promise.resolve(
                email === 'existing@example.com'
                  ? { userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
                  : null,
              ),
            ),
            findByPhoneNumber: jest.fn((phoneNumber: string) =>
              Promise.resolve(
                phoneNumber === '+905559998877'
                  ? { userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }
                  : null,
              ),
            ),
            create: jest.fn((input: unknown) => {
              createdUserInput = input;

              return Promise.resolve({
                userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              });
            }),
          },
        },
        {
          provide: PendingRegistrationStore,
          useValue: {
            save: jest.fn((registration: PendingRegistration) => {
              pendingRegistration = registration;

              return Promise.resolve();
            }),
            findByPhoneNumber: jest.fn((phoneNumber: string) =>
              Promise.resolve(
                pendingRegistration?.phoneNumber === phoneNumber
                  ? pendingRegistration
                  : null,
              ),
            ),
            delete: jest.fn((phoneNumber: string) => {
              if (pendingRegistration?.phoneNumber === phoneNumber) {
                pendingRegistration = null;
              }

              return Promise.resolve();
            }),
            getExpiresInSeconds: jest.fn().mockReturnValue(600),
          },
        },
        OtpService,
        {
          provide: OTP_PROVIDER,
          useValue: otpProvider,
        },
        {
          provide: OtpSecurityService,
          useValue: {
            consumeSend: jest.fn().mockResolvedValue(undefined),
            consumeVerificationAttempt: jest
              .fn()
              .mockResolvedValue({ isFinalAttempt: false }),
            clearVerificationAttempts: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DevicesService,
          useValue: { registerOrUpdate },
        },
        {
          provide: PrismaService,
          useValue: { refreshToken: {} },
        },
        {
          provide: JwtService,
          useValue: { signAsync, verifyAsync: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test'),
            getOrThrow: jest.fn(),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const server: unknown = app.getHttpServer();

    if (!isHttpServer(server)) {
      throw new Error('Test HTTP server is unavailable');
    }

    httpServer = server;
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a user only after valid OTP without returning credentials', async () => {
    const registrationResponse = await request(httpServer)
      .post('/api/auth/register')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'user@example.com',
        phoneNumber: '05551112233',
        password: 'password123',
      })
      .expect(201);

    expect(registrationResponse.body).toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    });
    expect(registrationResponse.headers['set-cookie']).toBeUndefined();
    expect(pendingRegistration?.phoneNumber).toBe('+905551112233');
    expect(pendingRegistration?.passwordHash).not.toBe('password123');
    const storedPasswordHash = pendingRegistration?.passwordHash;
    expect(createdUserInput).toBeUndefined();

    const invalidResponse = await request(httpServer)
      .post('/api/auth/register/verify')
      .send({
        phoneNumber: '+905551112233',
        code: '000000',
      })
      .expect(400);

    expect(invalidResponse.body).toEqual({
      statusCode: 400,
      code: 'OTP_INVALID_OR_EXPIRED',
      message: 'Doğrulama kodu geçersiz veya süresi dolmuş.',
    });
    expect(createdUserInput).toBeUndefined();

    const verificationResponse = await request(httpServer)
      .post('/api/auth/register/verify')
      .send({
        phoneNumber: '+905551112233',
        code: '123456',
      })
      .expect(201);

    expect(verificationResponse.body).toEqual({
      message: 'Kayıt başarıyla tamamlandı.',
    });
    expect(verificationResponse.headers['set-cookie']).toBeUndefined();
    expect(createdUserInput).toEqual({
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      phoneNumber: '+905551112233',
      passwordHash: storedPasswordHash,
      phoneVerified: true,
    });
    expect(pendingRegistration).toBeNull();
    expect(signAsync).not.toHaveBeenCalled();
    expect(registerOrUpdate).not.toHaveBeenCalled();
  });

  it.each(['/api/auth/refresh', '/api/auth/logout'])(
    'rejects fields outside the %s body contract',
    async (endpoint) => {
      const response = await request(httpServer)
        .post(endpoint)
        .send({ unexpected: true })
        .expect(400);

      const responseBody = response.body as unknown;

      if (
        typeof responseBody !== 'object' ||
        responseBody === null ||
        !('message' in responseBody)
      ) {
        throw new Error('Validation response body is invalid');
      }

      expect(responseBody.message).toContain(
        'property unexpected should not exist',
      );
    },
  );

  it.each([
    {
      email: 'existing@example.com',
      phoneNumber: '05552223344',
    },
    {
      email: 'new@example.com',
      phoneNumber: '05559998877',
    },
  ])(
    'does not expose whether registration identity already exists',
    async ({ email, phoneNumber }) => {
      const response = await request(httpServer)
        .post('/api/auth/register')
        .send({
          firstName: 'Test',
          lastName: 'User',
          email,
          phoneNumber,
          password: 'password123',
        })
        .expect(201);

      expect(response.body).toEqual({
        message: 'Doğrulama kodu gönderildi.',
        expiresInSeconds: 600,
      });
      expect(pendingRegistration).toBeNull();
      expect(createdUserInput).toBeUndefined();
    },
  );

  it('keeps provider failure indistinguishable from an existing identity', async () => {
    otpProvider.rejectRequests = true;

    const newIdentityResponse = await request(httpServer)
      .post('/api/auth/register')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'provider-failure@example.com',
        phoneNumber: '05553334455',
        password: 'password123',
      })
      .expect(201);

    const existingIdentityResponse = await request(httpServer)
      .post('/api/auth/register')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'existing@example.com',
        phoneNumber: '05554445566',
        password: 'password123',
      })
      .expect(201);

    expect(newIdentityResponse.body).toEqual(existingIdentityResponse.body);
    expect(pendingRegistration).toBeNull();
  });

  it('keeps resend provider failure indistinguishable from missing state', async () => {
    await request(httpServer)
      .post('/api/auth/register')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'resend@example.com',
        phoneNumber: '05556667788',
        password: 'password123',
      })
      .expect(201);

    otpProvider.rejectRequests = true;

    const activeStateResponse = await request(httpServer)
      .post('/api/auth/register/resend')
      .send({ phoneNumber: '05556667788' })
      .expect(201);

    const missingStateResponse = await request(httpServer)
      .post('/api/auth/register/resend')
      .send({ phoneNumber: '05557778899' })
      .expect(201);

    expect(activeStateResponse.body).toEqual(missingStateResponse.body);
  });
});
