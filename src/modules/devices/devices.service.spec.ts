import { createHash } from 'node:crypto';

import { ConflictException, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PlatformType } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

type DeviceResponse = {
  deviceId: number;
  platform: (typeof PlatformType)[keyof typeof PlatformType];
  deviceName: string;
  lastActive: Date;
  isActive: boolean;
  createdAt: Date;
};

type PreviousDevice = {
  deviceId: number;
  userId: number;
  installationId: string;
  isActive: boolean;
};

type RunTransaction = (
  callback: (transaction: Prisma.TransactionClient) => Promise<DeviceResponse>,
  options?: {
    isolationLevel?: Prisma.TransactionIsolationLevel;
  },
) => Promise<DeviceResponse>;

describe('DevicesService', () => {
  const userId = 42;
  const dto: RegisterDeviceDto = {
    installationId: '550e8400-e29b-41d4-a716-446655440000',
    platform: PlatformType.WINDOWS,
    deviceName: 'Office Desktop',
    pushToken: 'new-token',
  };
  const pushTokenHash = createHash('sha256')
    .update(dto.pushToken ?? '', 'utf8')
    .digest('hex');
  const device: DeviceResponse = {
    deviceId: 7,
    platform: PlatformType.WINDOWS,
    deviceName: 'Office Desktop',
    lastActive: new Date('2026-08-07T09:00:00.000Z'),
    isActive: true,
    createdAt: new Date('2026-08-07T08:00:00.000Z'),
  };

  let findFirst: jest.MockedFunction<
    (args: Prisma.DeviceFindFirstArgs) => Promise<{ deviceId: number } | null>
  >;
  let findUnique: jest.MockedFunction<
    (args: Prisma.DeviceFindUniqueArgs) => Promise<PreviousDevice | null>
  >;
  let update: jest.MockedFunction<
    (args: Prisma.DeviceUpdateArgs) => Promise<unknown>
  >;
  let upsert: jest.MockedFunction<
    (args: Prisma.DeviceUpsertArgs) => Promise<DeviceResponse>
  >;
  let findMany: jest.MockedFunction<
    (args: Prisma.DeviceFindManyArgs) => Promise<DeviceResponse[]>
  >;
  let updateMany: jest.MockedFunction<
    (args: Prisma.DeviceUpdateManyArgs) => Promise<Prisma.BatchPayload>
  >;
  let runTransaction: jest.MockedFunction<RunTransaction>;
  let service: DevicesService;

  beforeEach(() => {
    findFirst = jest.fn();
    findUnique = jest.fn();
    update = jest.fn();
    upsert = jest.fn();
    findMany = jest.fn();
    updateMany = jest.fn();

    findFirst.mockResolvedValue(null);
    findUnique.mockResolvedValue(null);
    update.mockResolvedValue(undefined);
    upsert.mockResolvedValue(device);
    findMany.mockResolvedValue([device]);
    updateMany.mockResolvedValue({ count: 1 });

    const transaction = {
      device: {
        findFirst,
        findUnique,
        update,
        upsert,
      },
    } as unknown as Prisma.TransactionClient;

    runTransaction = jest.fn((callback) => callback(transaction));

    service = new DevicesService({
      $transaction: runTransaction,
      device: {
        findFirst,
        findMany,
        updateMany,
      },
    } as unknown as PrismaService);
  });

  it('lists only the user devices with safe fields and security ordering', async () => {
    const result = await service.findAllForUser(userId);

    expect(result).toEqual([device]);
    expect(result[0]).not.toHaveProperty('pushToken');
    expect(result[0]).not.toHaveProperty('pushTokenHash');
    expect(result[0]).not.toHaveProperty('installationId');
    expect(result[0]).not.toHaveProperty('userId');
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId,
      },
      orderBy: [
        {
          isActive: 'desc',
        },
        {
          lastActive: 'desc',
        },
      ],
      select: {
        deviceId: true,
        platform: true,
        deviceName: true,
        lastActive: true,
        isActive: true,
        createdAt: true,
      },
    });
  });

  it('returns only an active device owned by the user', async () => {
    findFirst.mockResolvedValue({ deviceId: device.deviceId });

    await expect(
      service.requireActiveOwnedDevice(userId, device.deviceId),
    ).resolves.toEqual({
      deviceId: device.deviceId,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        deviceId: device.deviceId,
        userId,
        isActive: true,
      },
      select: {
        deviceId: true,
      },
    });
  });

  it('does not expose whether an unavailable device belongs to another user', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.requireActiveOwnedDevice(userId, device.deviceId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deactivates an owned device and clears both push token fields', async () => {
    await expect(
      service.deactivateOwnedDevice(userId, device.deviceId),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        deviceId: device.deviceId,
        userId,
      },
      data: {
        isActive: false,
        pushToken: null,
        pushTokenHash: null,
      },
    });
  });

  it('keeps device deactivation idempotent when no owned device is found', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.deactivateOwnedDevice(userId, device.deviceId),
    ).resolves.toBe(false);
  });

  it('upserts a device by user and installation without exposing the push token', async () => {
    const result = await service.registerOrUpdate(userId, dto);
    const upsertArgs = upsert.mock.calls[0][0];

    expect(result).toEqual(device);
    expect(result).not.toHaveProperty('pushToken');
    expect(upsertArgs.where).toEqual({
      userId_installationId: {
        userId,
        installationId: dto.installationId,
      },
    });
    expect(upsertArgs.create).toEqual(
      expect.objectContaining({
        userId,
        installationId: dto.installationId,
        platform: dto.platform,
        deviceName: dto.deviceName,
        pushToken: dto.pushToken,
        pushTokenHash,
        isActive: true,
      }),
    );
    expect(upsertArgs.update).toEqual(
      expect.objectContaining({
        platform: dto.platform,
        deviceName: dto.deviceName,
        pushToken: dto.pushToken,
        pushTokenHash,
        isActive: true,
      }),
    );
    expect(upsertArgs.select).toEqual({
      deviceId: true,
      platform: true,
      deviceName: true,
      lastActive: true,
      isActive: true,
      createdAt: true,
    });
    expect(runTransaction.mock.calls[0][1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('keeps the stored push token when a new token is omitted', async () => {
    const dtoWithoutPushToken: RegisterDeviceDto = {
      installationId: dto.installationId,
      platform: dto.platform,
      deviceName: dto.deviceName,
    };

    await service.registerOrUpdate(userId, dtoWithoutPushToken);
    const upsertArgs = upsert.mock.calls[0][0];

    expect(upsertArgs.create).not.toHaveProperty('pushToken');
    expect(upsertArgs.create).not.toHaveProperty('pushTokenHash');
    expect(upsertArgs.update).not.toHaveProperty('pushToken');
    expect(upsertArgs.update).not.toHaveProperty('pushTokenHash');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('clears the push token without deactivating the device when null is sent', async () => {
    const dtoWithNullPushToken: RegisterDeviceDto = {
      installationId: dto.installationId,
      platform: dto.platform,
      deviceName: dto.deviceName,
      pushToken: null,
    };

    await service.registerOrUpdate(userId, dtoWithNullPushToken);
    const upsertArgs = upsert.mock.calls[0][0];

    expect(upsertArgs.create).toEqual(
      expect.objectContaining({
        pushToken: null,
        pushTokenHash: null,
        isActive: true,
      }),
    );
    expect(upsertArgs.update).toEqual(
      expect.objectContaining({
        pushToken: null,
        pushTokenHash: null,
        isActive: true,
      }),
    );
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects an installation used by another active account', async () => {
    findFirst.mockResolvedValue({ deviceId: 99 });

    await expect(service.registerOrUpdate(userId, dto)).rejects.toThrow(
      ConflictException,
    );
    expect(findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('moves a push token from the same user previous installation', async () => {
    findUnique.mockResolvedValue({
      deviceId: 6,
      userId,
      installationId: '3a290f0a-69d8-4c5d-bd78-a8799ea4aab1',
      isActive: true,
    });

    await service.registerOrUpdate(userId, dto);

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        pushTokenHash,
      },
      select: {
        deviceId: true,
        userId: true,
        installationId: true,
        isActive: true,
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: {
        deviceId: 6,
      },
      data: {
        pushToken: null,
        pushTokenHash: null,
        isActive: false,
      },
    });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects a push token owned by another active account', async () => {
    findUnique.mockResolvedValue({
      deviceId: 8,
      userId: 84,
      installationId: 'b84fc66d-bb04-4f71-b5a7-fddf24c31362',
      isActive: true,
    });

    await expect(service.registerOrUpdate(userId, dto)).rejects.toThrow(
      ConflictException,
    );
    expect(update).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('retries a serializable transaction conflict', async () => {
    const retryableError = new Prisma.PrismaClientKnownRequestError(
      'Transaction conflict',
      {
        code: 'P2034',
        clientVersion: '7.9.1',
      },
    );
    const transaction = {
      device: {
        findFirst,
        findUnique,
        update,
        upsert,
      },
    } as unknown as Prisma.TransactionClient;

    runTransaction
      .mockRejectedValueOnce(retryableError)
      .mockImplementation((callback) => callback(transaction));

    await expect(service.registerOrUpdate(userId, dto)).resolves.toEqual(
      device,
    );
    expect(runTransaction).toHaveBeenCalledTimes(2);
  });

  it('maps a unique constraint error to a conflict response', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.9.1',
      },
    );
    runTransaction.mockRejectedValue(uniqueError);

    await expect(service.registerOrUpdate(userId, dto)).rejects.toThrow(
      ConflictException,
    );
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });
});
