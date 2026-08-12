import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';

import { PlatformType } from '../src/generated/prisma/enums';
import { JwtStrategy } from '../src/modules/auth/strategies/jwt.strategy';
import { DevicesController } from '../src/modules/devices/devices.controller';
import { DevicesService } from '../src/modules/devices/devices.service';

describe('DevicesController (e2e)', () => {
  const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const email = 'user@example.com';
  const accessSecret = randomBytes(32).toString('hex');
  const device = {
    deviceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    platform: PlatformType.WINDOWS,
    deviceName: 'Office Desktop',
    lastActive: new Date('2026-08-07T09:00:00.000Z'),
    isActive: true,
    createdAt: new Date('2026-08-07T08:00:00.000Z'),
  };

  let app: INestApplication<App>;
  let server: App;
  let accessToken: string;
  let findAllForUser: jest.MockedFunction<DevicesService['findAllForUser']>;
  let registerOrUpdate: jest.MockedFunction<DevicesService['registerOrUpdate']>;

  beforeAll(async () => {
    findAllForUser = jest.fn() as jest.MockedFunction<DevicesService['findAllForUser']>;
    registerOrUpdate = jest.fn() as jest.MockedFunction<DevicesService['registerOrUpdate']>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({
          defaultStrategy: 'jwt',
        }),
      ],
      controllers: [DevicesController],
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
          provide: DevicesService,
          useValue: {
            findAllForUser,
            registerOrUpdate,
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
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
    findAllForUser.mockReset();
    registerOrUpdate.mockReset();
    findAllForUser.mockResolvedValue([device]);
    registerOrUpdate.mockResolvedValue(device);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 when the access token cookie is missing', async () => {
    await request(server).get('/api/devices').expect(401);

    expect(findAllForUser).not.toHaveBeenCalled();
  });

  it('lists devices with the user id obtained from the JWT cookie', async () => {
    const response = await request(server)
      .get('/api/devices')
      .set('Cookie', `accessToken=${accessToken}`)
      .expect(200);

    expect(response.body).toEqual([
      {
        ...device,
        lastActive: device.lastActive.toISOString(),
        createdAt: device.createdAt.toISOString(),
      },
    ]);
    expect(findAllForUser).toHaveBeenCalledWith(userId);
  });

  it('rejects fields outside the device registration contract', async () => {
    await request(server)
      .put('/api/devices')
      .set('Cookie', `accessToken=${accessToken}`)
      .send({
        installationId: '550e8400-e29b-41d4-a716-446655440000',
        platform: 'WINDOWS',
        deviceName: 'Office Desktop',
        userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      })
      .expect(400);

    expect(registerOrUpdate).not.toHaveBeenCalled();
  });

  it('normalizes a valid device request before calling the service', async () => {
    await request(server)
      .put('/api/devices')
      .set('Cookie', `accessToken=${accessToken}`)
      .send({
        installationId: '550E8400-E29B-41D4-A716-446655440000',
        platform: 'WINDOWS',
        deviceName: '  Office Desktop  ',
        pushToken: '  sample-token  ',
      })
      .expect(200);

    expect(registerOrUpdate).toHaveBeenCalledWith(userId, {
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      platform: PlatformType.WINDOWS,
      deviceName: 'Office Desktop',
      pushToken: 'sample-token',
    });
  });

  it('accepts null to clear the device push token', async () => {
    await request(server)
      .put('/api/devices')
      .set('Cookie', `accessToken=${accessToken}`)
      .send({
        installationId: '550e8400-e29b-41d4-a716-446655440000',
        platform: 'ANDROID',
        deviceName: 'Pixel 8',
        pushToken: null,
      })
      .expect(200);

    expect(registerOrUpdate).toHaveBeenCalledWith(userId, {
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      platform: PlatformType.ANDROID,
      deviceName: 'Pixel 8',
      pushToken: null,
    });
  });
});
