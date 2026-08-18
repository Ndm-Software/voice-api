import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

import { UsersModule } from '../users/users.module';
import { DevicesModule } from '../devices/devices.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisIntegrationModule } from '../../integrations/redis/redis-integration.module';
import { OtpModule } from '../otp/otp.module';
import { PendingRegistrationStore } from './pending-registration.store';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    UsersModule,
    DevicesModule,
    RedisIntegrationModule,
    OtpModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<StringValue>(
            'JWT_ACCESS_EXPIRES_IN',
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PendingRegistrationStore],
})
export class AuthModule {}
