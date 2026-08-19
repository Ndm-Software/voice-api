import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { HealthController } from './health.controller';
import { HealthReport, HealthService } from './health.service';

describe('HealthController', () => {
  const report: HealthReport = {
    status: 'ok',
    services: {
      api: 'up',
      postgresql: 'up',
      redis: 'up',
    },
  };

  it('returns the health service report', async () => {
    const healthService = {
      check: jest.fn().mockResolvedValue(report),
    } as unknown as HealthService;
    const controller = new HealthController(healthService);

    await expect(controller.getHealth()).resolves.toEqual(report);
  });

  it('is explicitly public for infrastructure monitoring', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
  });
});
