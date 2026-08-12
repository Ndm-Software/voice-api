import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PlatformType } from '../../generated/prisma/enums';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

describe('DevicesController', () => {
  const device = {
    deviceId: '11111111-1111-4111-8111-111111111111',
    platform: PlatformType.WINDOWS,
    deviceName: 'Office Desktop',
    lastActive: new Date('2026-08-07T09:00:00.000Z'),
    isActive: true,
    createdAt: new Date('2026-08-07T08:00:00.000Z'),
  };

  let registerOrUpdate: jest.MockedFunction<DevicesService['registerOrUpdate']>;
  let findAllForUser: jest.MockedFunction<DevicesService['findAllForUser']>;
  let controller: DevicesController;

  beforeEach(() => {
    registerOrUpdate = jest.fn() as jest.MockedFunction<DevicesService['registerOrUpdate']>;
    findAllForUser = jest.fn() as jest.MockedFunction<DevicesService['findAllForUser']>;
    controller = new DevicesController({
      findAllForUser,
      registerOrUpdate,
    } as unknown as DevicesService);
  });

  it('lists only through the authenticated user id', async () => {
    const user: AuthenticatedUser = {
      userId: '22222222-2222-4222-8222-222222222222',
      email: 'user@example.com',
    };
    findAllForUser.mockResolvedValue([device]);

    await expect(controller.findAll(user)).resolves.toEqual([device]);
    expect(findAllForUser).toHaveBeenCalledWith(user.userId);
  });

  it('passes the authenticated user id and validated DTO to the service', async () => {
    const user: AuthenticatedUser = {
      userId: '22222222-2222-4222-8222-222222222222',
      email: 'user@example.com',
    };
    const dto: RegisterDeviceDto = {
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      platform: PlatformType.WINDOWS,
      deviceName: 'Office Desktop',
    };
    registerOrUpdate.mockResolvedValue(device);

    await expect(controller.registerOrUpdate(user, dto)).resolves.toEqual(
      device,
    );
    expect(registerOrUpdate).toHaveBeenCalledWith(user.userId, dto);
  });

  it('exposes a guarded PUT devices route', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      DevicesController.prototype,
      'registerOrUpdate',
    )?.value;

    if (typeof handler !== 'function') {
      throw new Error('Devices route handler is not defined.');
    }

    const controllerPath: unknown = Reflect.getMetadata(
      PATH_METADATA,
      DevicesController,
    );
    const methodPath: unknown = Reflect.getMetadata(PATH_METADATA, handler);
    const requestMethod: unknown = Reflect.getMetadata(
      METHOD_METADATA,
      handler,
    );
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      DevicesController,
    ) as unknown[];

    expect(controllerPath).toBe('devices');
    expect(methodPath).toBe('/');
    expect(requestMethod).toBe(RequestMethod.PUT);
    expect(guards).toContain(JwtAuthGuard);
  });

  it('exposes a guarded GET devices route', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      DevicesController.prototype,
      'findAll',
    )?.value;

    if (typeof handler !== 'function') {
      throw new Error('Devices list route handler is not defined.');
    }

    const controllerPath: unknown = Reflect.getMetadata(
      PATH_METADATA,
      DevicesController,
    );
    const methodPath: unknown = Reflect.getMetadata(PATH_METADATA, handler);
    const requestMethod: unknown = Reflect.getMetadata(
      METHOD_METADATA,
      handler,
    );
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      DevicesController,
    ) as unknown[];

    expect(controllerPath).toBe('devices');
    expect(methodPath).toBe('/');
    expect(requestMethod).toBe(RequestMethod.GET);
    expect(guards).toContain(JwtAuthGuard);
  });
});
