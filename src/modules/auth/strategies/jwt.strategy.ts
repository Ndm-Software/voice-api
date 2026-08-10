import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request.cookies?.accessToken,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'), //imzayı doğrular
    });
  }
  //usermodul gelince değişicek const user = await this.userService.findById(payload.sub) return user;
  async validate(payload: { sub: number; email: string; deviceId?: number }) {
    return {
      userId: payload.sub,
      email: payload.email,
      deviceId: payload.deviceId,
    };
  }
}
