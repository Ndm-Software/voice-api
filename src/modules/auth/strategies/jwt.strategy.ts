import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { isUUID } from 'class-validator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request | undefined): string | null => {
          const cookieRequest = request as
            { cookies?: { accessToken?: string } } | undefined;

          return cookieRequest?.cookies?.accessToken ?? null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: { sub?: unknown; deviceId?: unknown }) {
    if (typeof payload.sub !== 'string' || !isUUID(payload.sub, '4')) {
      throw new UnauthorizedException('Invalid access token.');
    }

    if (
      payload.deviceId !== undefined &&
      (typeof payload.deviceId !== 'string' || !isUUID(payload.deviceId, '4'))
    ) {
      throw new UnauthorizedException('Invalid access token.');
    }

    return {
      userId: payload.sub,
      deviceId: payload.deviceId,
    };
  }
}
