import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

describe('RemindersController', () => {
  type ReminderServiceMock = {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  it('forwards authenticated reminder operations to the service', async () => {
    const service: ReminderServiceMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    const controller = new RemindersController(
      service as unknown as RemindersService,
    );
    const user = { userId: '11111111-1111-4111-8111-111111111111' };
    const dto = {} as never;
    const filterDto = {} as never;

    await controller.create(user, dto);
    await controller.findAll(user, filterDto);
    await controller.findOne(user, 'reminder-id');
    await controller.update(user, 'reminder-id', dto);
    await controller.remove(user, 'reminder-id');

    expect(service.create).toHaveBeenCalledWith(user.userId, dto);
    expect(service.findAll).toHaveBeenCalledWith(user.userId, filterDto);
    expect(service.findOne).toHaveBeenCalledWith(user.userId, 'reminder-id');
    expect(service.update).toHaveBeenCalledWith(
      user.userId,
      'reminder-id',
      dto,
    );
    expect(service.remove).toHaveBeenCalledWith(user.userId, 'reminder-id');
  });
});
