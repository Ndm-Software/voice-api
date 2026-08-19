import { Test, TestingModule } from '@nestjs/testing';

import { REDIS_CLIENT } from '../integrations/redis/redis.constants';
import { PrismaService } from '../prisma/prisma.service';
import { HealthModule } from './health.module';

describe('HealthModule', () => {
  it('compiles as an application module', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn() })
      .overrideProvider(REDIS_CLIENT)
      .useValue({
        isOpen: false,
        connect: jest.fn(),
        quit: jest.fn(),
        ping: jest.fn(),
        set: jest.fn(),
        get: jest.fn(),
        del: jest.fn(),
        eval: jest.fn(),
      })
      .compile();

    expect(module).toBeDefined();
    await module.close();
  });
});
