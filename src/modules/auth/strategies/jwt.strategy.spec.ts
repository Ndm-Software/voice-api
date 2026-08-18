import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const userId = '6b11643d-77d7-4fd9-81a8-43c51e07f7b0';
  const deviceId = 'a25e1cbf-6304-4c69-84f7-d43189375d03';
  let strategy: JwtStrategy;

  beforeEach(() => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('access-secret'),
    } as unknown as ConfigService;

    strategy = new JwtStrategy(configService);
  });

  it('maps valid UUID claims to the authenticated user', () => {
    expect(strategy.validate({ sub: userId, deviceId })).toEqual({
      userId,
      deviceId,
    });
  });

  it.each([
    {},
    { sub: 42 },
    { sub: '42' },
    { sub: 'not-a-uuid' },
    { sub: userId, deviceId: 7 },
    { sub: userId, deviceId: 'not-a-uuid' },
  ])('rejects invalid UUID claims', (payload) => {
    expect(() => strategy.validate(payload)).toThrow(
      new UnauthorizedException('Invalid access token.'),
    );
  });
});
