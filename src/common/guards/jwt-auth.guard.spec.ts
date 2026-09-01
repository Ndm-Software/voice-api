import { Server } from 'node:http';

import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { JwtStrategy } from '../../modules/auth/strategies/jwt.strategy';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('jwt-test')
@UseGuards(JwtAuthGuard)
class JwtTestController {
  @Get('protected')
  getProtected(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('user-id')
  getUserId(@CurrentUser('userId') userId: string) {
    return { userId };
  }

  @Public()
  @Get('public')
  getPublic() {
    return { public: true };
  }

  @Public()
  @Get('public-user')
  getPublicUser(@CurrentUser() user?: AuthenticatedUser) {
    return { user: user ?? null };
  }
}

describe('JwtAuthGuard and authentication decorators', () => {
  const accessSecret = 'card-07-access-secret';
  const userId = '6b11643d-77d7-4fd9-81a8-43c51e07f7b0';
  const deviceId = 'a25e1cbf-6304-4c69-84f7-d43189375d03';
  let app: INestApplication;
  let jwtService: JwtService;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: accessSecret,
        }),
      ],
      controllers: [JwtTestController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(accessSecret),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    jwtService = moduleRef.get(JwtService);
    const httpServer: unknown = app.getHttpServer();

    if (!(httpServer instanceof Server)) {
      throw new Error('HTTP test server was not initialized.');
    }

    server = httpServer as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('bypasses JWT authentication for public handlers', async () => {
    await request(server).get('/jwt-test/public').expect(200, { public: true });
  });

  it('rejects a protected handler without an access token', async () => {
    await request(server).get('/jwt-test/protected').expect(401);
  });

  it('rejects a malformed access token', async () => {
    await request(server)
      .get('/jwt-test/protected')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('rejects an expired access token', async () => {
    const token = jwtService.sign({ sub: userId }, { expiresIn: -1 });

    await request(server)
      .get('/jwt-test/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('extracts the authenticated user from a valid bearer token', async () => {
    const token = jwtService.sign({ sub: userId, deviceId });

    await request(server)
      .get('/jwt-test/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { userId, deviceId });
  });

  it('extracts a selected authenticated user property', async () => {
    const token = jwtService.sign({ sub: userId });

    await request(server)
      .get('/jwt-test/user-id')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { userId });
  });

  it('accepts a valid access token from the web cookie', async () => {
    const token = jwtService.sign({ sub: userId, deviceId });

    await request(server)
      .get('/jwt-test/protected')
      .set('Cookie', [`accessToken=${token}`])
      .expect(200, { userId, deviceId });
  });

  it('does not treat a client-controlled header as an authenticated user', async () => {
    await request(server)
      .get('/jwt-test/public-user')
      .set('x-user', JSON.stringify({ userId, deviceId }))
      .expect(200, { user: null });
  });
});
