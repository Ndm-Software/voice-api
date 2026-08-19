import { Module } from '@nestjs/common';

import { RedisIntegrationModule } from '../integrations/redis/redis-integration.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [PrismaModule, RedisIntegrationModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
