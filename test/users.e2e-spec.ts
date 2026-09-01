import { randomBytes } from 'node:crypto';

import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';

import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { createCorsOptions } from '../src/common/config/cors.config';
import { UsersController } from '../src/modules/users/users.controller';
import { UsersService } from '../src/modules/users/users.service';

describe('UsersController account deletion (e2e)', () => {
  const userId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const email = 'user@example.com';
  const accessSecret = randomBytes(32).toString('hex');

  let app: INestApplication<App>;
  let server: App;
  let accessToken: string;
  let remove: jest.MockedFunction<UsersService['remove']>;
  let update: jest.MockedFunction<UsersService['update']>;

  beforeAll(async () => {
    remove = jest.fn() as jest.MockedFunction<UsersService['remove']>;
    update = jest.fn() as jest.MockedFunction<UsersService['update']>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({
          defaultStrategy: 'jwt',
        }),
      ],
      controllers: [UsersController],
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string): string => {
              if (key === 'JWT_ACCESS_SECRET') {
                return accessSecret;
              }

              throw new Error(`Unexpected configuration key: ${key}`);
            },
          },
        },
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(),
            update,
            remove,
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors(createCorsOptions('http://localhost:3000'));
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    server = app.getHttpServer();
    accessToken = await new JwtService({
      secret: accessSecret,
    }).signAsync({
      sub: userId,
      email,
    });
  });

  beforeEach(() => {
    remove.mockReset();
    update.mockReset();
    remove.mockResolvedValue({
      message: 'Kullanıcı hesabı başarıyla silindi.',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 without an access token cookie', async () => {
    await request(server).delete('/api/users/me').expect(401);

    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects phone changes outside the OTP workflow', async () => {
    await request(server)
      .patch('/api/users/me')
      .set('Cookie', `accessToken=${accessToken}`)
      .send({ phoneNumber: '+905551112233' })
      .expect(400);

    expect(update).not.toHaveBeenCalled();
  });

  it('allows credentialed DELETE preflight from the configured frontend', async () => {
    const response = await request(server)
      .options('/api/users/me')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'DELETE')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toContain(
      'DELETE',
    );
  });

  it('deletes the JWT user and clears both auth cookies', async () => {
    const response = await request(server)
      .delete('/api/users/me')
      .set('Cookie', `accessToken=${accessToken}`)
      .send({ userId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })
      .expect(200);

    expect(response.body).toEqual({
      message: 'Kullanıcı hesabı başarıyla silindi.',
    });
    expect(remove).toHaveBeenCalledWith(userId);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('accessToken=;'),
        expect.stringContaining('refreshToken=;'),
      ]),
    );
  });

  it('keeps cookies when the account does not exist', async () => {
    remove.mockRejectedValueOnce(
      new NotFoundException('Kullanıcı bulunamadı.'),
    );

    const response = await request(server)
      .delete('/api/users/me')
      .set('Cookie', `accessToken=${accessToken}`)
      .expect(404);

    expect(response.headers['set-cookie']).toBeUndefined();
  });
});
