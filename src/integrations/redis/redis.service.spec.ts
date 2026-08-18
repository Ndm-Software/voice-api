import { RedisService } from './redis.service';

describe('RedisService', () => {
  let client: {
    isOpen: boolean;
    connect: jest.Mock;
    quit: jest.Mock;
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    eval: jest.Mock;
  };
  let service: RedisService;

  beforeEach(() => {
    client = {
      isOpen: false,
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      eval: jest.fn(),
    };
    service = new RedisService(client);
  });

  it('connects once during module initialization', async () => {
    await service.onModuleInit();

    expect(client.connect).toHaveBeenCalledTimes(1);

    client.isOpen = true;
    await service.onModuleInit();

    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('closes an open client during application shutdown', async () => {
    client.isOpen = true;

    await service.onApplicationShutdown();

    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('does not close an unopened client', async () => {
    await service.onApplicationShutdown();

    expect(client.quit).not.toHaveBeenCalled();
  });

  it('uses an expiring Redis value', async () => {
    await service.setWithExpiry('key', 'value', 600);

    expect(client.set).toHaveBeenCalledWith('key', 'value', { EX: 600 });
  });

  it('reserves a key only when Redis accepts NX', async () => {
    client.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    await expect(
      service.setIfAbsentWithExpiry('cooldown', '1', 60),
    ).resolves.toBe(true);
    await expect(
      service.setIfAbsentWithExpiry('cooldown', '1', 60),
    ).resolves.toBe(false);
    expect(client.set).toHaveBeenCalledWith('cooldown', '1', {
      EX: 60,
      NX: true,
    });
  });

  it('increments a counter with an atomic expiry script', async () => {
    client.eval.mockResolvedValue(3);

    await expect(service.incrementWithExpiry('counter', 3600)).resolves.toBe(3);
    expect(client.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ['counter'],
      arguments: ['3600'],
    });
  });

  it('rejects an invalid Redis counter result', async () => {
    client.eval.mockResolvedValue('3');

    await expect(service.incrementWithExpiry('counter', 3600)).rejects.toThrow(
      'Redis counter returned an invalid result',
    );
  });
});
