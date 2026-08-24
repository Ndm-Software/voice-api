import { UserSettingsController } from './user-settings.controller';
import { UserSettingsService } from './user-settings.service';
import { Request } from 'express';

describe('UserSettingsController', () => {
  type SettingsServiceMock = {
    findMine: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };
  type AuthenticatedRequest = Request & {
    user: { userId: string };
  };

  it('forwards the authenticated user to settings operations', async () => {
    const service: SettingsServiceMock = {
      findMine: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const controller = new UserSettingsController(
      service as unknown as UserSettingsService,
    );
    const request: AuthenticatedRequest = {
      user: { userId: '11111111-1111-4111-8111-111111111111' },
    } as unknown as AuthenticatedRequest;
    const dto = {} as never;

    await controller.findMine(request);
    await controller.saveMine(request, dto);
    await controller.updateMine(request, dto);

    expect(service.findMine).toHaveBeenCalledWith(request.user.userId);
    expect(service.save).toHaveBeenCalledWith(request.user.userId, dto);
    expect(service.update).toHaveBeenCalledWith(request.user.userId, dto);
  });
});
