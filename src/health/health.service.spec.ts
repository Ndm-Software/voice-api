import { RedisService } from '../integrations/redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { HEALTH_CHECK_TIMEOUT_MS, HealthService } from './health.service';

describe('HealthService', () => {
  let prisma: { $queryRaw: jest.Mock };
  let redis: { ping: jest.Mock };
  let service: HealthService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
    };
    redis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    };
    service = new HealthService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports API, PostgreSQL, and Redis as available', async () => {
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      services: {
        api: 'up',
        postgresql: 'up',
        redis: 'up',
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(redis.ping).toHaveBeenCalledTimes(1);
  });

  it('reports a database failure without exposing its error', async () => {
    prisma.$queryRaw.mockRejectedValue(
      new Error('postgresql://user:password@database/internal'),
    );

    const report = await service.check();

    expect(report).toEqual({
      status: 'error',
      services: {
        api: 'up',
        postgresql: 'down',
        redis: 'up',
      },
    });
    expect(JSON.stringify(report)).not.toContain('password');
    expect(JSON.stringify(report)).not.toContain('database/internal');
  });

  it('reports a Redis failure without exposing its error', async () => {
    redis.ping.mockRejectedValue(new Error('redis://secret@redis/internal'));

    const report = await service.check();

    expect(report).toEqual({
      status: 'error',
      services: {
        api: 'up',
        postgresql: 'up',
        redis: 'down',
      },
    });
    expect(JSON.stringify(report)).not.toContain('secret');
    expect(JSON.stringify(report)).not.toContain('redis/internal');
  });

  it('times out a hanging PostgreSQL check', async () => {
    jest.useFakeTimers();
    prisma.$queryRaw.mockReturnValue(new Promise(() => undefined));

    const reportPromise = service.check();
    await jest.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS);

    await expect(reportPromise).resolves.toEqual({
      status: 'error',
      services: {
        api: 'up',
        postgresql: 'down',
        redis: 'up',
      },
    });
  });

  it('times out a hanging Redis check', async () => {
    jest.useFakeTimers();
    redis.ping.mockReturnValue(new Promise(() => undefined));

    const reportPromise = service.check();
    await jest.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS);

    await expect(reportPromise).resolves.toEqual({
      status: 'error',
      services: {
        api: 'up',
        postgresql: 'up',
        redis: 'down',
      },
    });
  });
});
