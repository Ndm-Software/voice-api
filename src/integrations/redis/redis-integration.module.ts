import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

const logger = new Logger('RedisIntegration');

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const client = createClient({
          url: configService.getOrThrow<string>('redis.url'),
        });

        client.on('error', () => {
          logger.error('Redis connection error.');
        });

        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisIntegrationModule {}
