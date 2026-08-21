import { GUARDS_METADATA } from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { SilentHoursController } from './silent-hours.controller';
import { SilentHoursService } from './silent-hours.service';

describe('SilentHoursController', () => {
  let controller: SilentHoursController;
  let service: jest.Mocked<
    Pick<
      SilentHoursService,
      'create' | 'findAll' | 'findOne' | 'update' | 'remove'
    >
  >;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new SilentHoursController(
      service as unknown as SilentHoursService,
    );
  });

  it('uses the authenticated user for service calls', async () => {
    const user: AuthenticatedUser = {
      userId: '22222222-2222-4222-8222-222222222222',
    };
    const dto = {
      dayOfWeek: 'MONDAY',
      silentStart: '22:00',
      silentEnd: '07:00',
    } as never;
    service.create.mockResolvedValue(
      {} as Awaited<ReturnType<SilentHoursService['create']>>,
    );

    await expect(controller.create(user, dto)).resolves.toEqual({});
    expect(service.create).toHaveBeenCalledWith(user.userId, dto);
  });

  it('forwards all authenticated-user operations to the service', async () => {
    const user: AuthenticatedUser = { userId: 'user-id' };
    const silentHourId = 'silent-hour-id';
    const dto = { silentStart: '22:00' } as never;

    service.findAll.mockResolvedValue([]);
    service.findOne.mockResolvedValue({} as never);
    service.update.mockResolvedValue({} as never);
    service.remove.mockResolvedValue({ success: true } as never);

    await controller.findAll(user);
    await controller.findOne(user, silentHourId);
    await controller.update(user, silentHourId, dto);
    await controller.remove(user, silentHourId);

    expect(service.findAll).toHaveBeenCalledWith(user.userId);
    expect(service.findOne).toHaveBeenCalledWith(user.userId, silentHourId);
    expect(service.update).toHaveBeenCalledWith(user.userId, silentHourId, dto);
    expect(service.remove).toHaveBeenCalledWith(user.userId, silentHourId);
  });

  it('protects the controller with JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SilentHoursController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
  });
});
