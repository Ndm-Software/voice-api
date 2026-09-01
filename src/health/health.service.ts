import { Injectable } from '@nestjs/common';

import { RedisService } from '../integrations/redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

type DependencyStatus = 'up' | 'down';

export const HEALTH_CHECK_TIMEOUT_MS = 2_000;

export interface HealthReport {
  status: 'ok' | 'error';
  services: {
    api: 'up';
    postgresql: DependencyStatus;
    redis: DependencyStatus;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    const [postgresql, redis] = await Promise.all([
      this.checkPostgresql(),
      this.checkRedis(),
    ]);

    return {
      status: postgresql === 'up' && redis === 'up' ? 'ok' : 'error',
      services: {
        api: 'up',
        postgresql,
        redis,
      },
    };
  }

  private async checkPostgresql(): Promise<DependencyStatus> {
    try {
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`);

      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    try {
      return (await this.withTimeout(this.redis.ping())) === 'PONG'
        ? 'up'
        : 'down';
    } catch {
      return 'down';
    }
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Health check timed out.')),
        HEALTH_CHECK_TIMEOUT_MS,
      );
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
