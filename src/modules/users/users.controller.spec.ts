import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Response } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController account deletion', () => {
  const user: AuthenticatedUser = {
    userId: '99999999-9999-4999-8999-999999999999',
    email: 'user@example.com',
  };
  const result = {
    message: 'Kullanıcı hesabı başarıyla silindi.',
  };

  let remove: jest.MockedFunction<UsersService['remove']>;
  let clearCookie: jest.MockedFunction<Response['clearCookie']>;
  let controller: UsersController;
  let response: Response;

  beforeEach(() => {
    remove = jest.fn() as jest.MockedFunction<UsersService['remove']>;
    clearCookie = jest.fn() as jest.MockedFunction<Response['clearCookie']>;
    controller = new UsersController({ remove } as unknown as UsersService);
    response = { clearCookie } as unknown as Response;
  });

  it('deletes only the authenticated user and clears both auth cookies', async () => {
    remove.mockResolvedValue(result);

    await expect(controller.removeMe(user, response)).resolves.toEqual(result);

    expect(remove).toHaveBeenCalledWith(user.userId);
    expect(clearCookie).toHaveBeenNthCalledWith(1, 'accessToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });
    expect(clearCookie).toHaveBeenNthCalledWith(2, 'refreshToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });
  });

  it('does not clear cookies when account deletion fails', async () => {
    remove.mockRejectedValue(new Error('delete failed'));

    await expect(controller.removeMe(user, response)).rejects.toThrow(
      'delete failed',
    );
    expect(clearCookie).not.toHaveBeenCalled();
  });

  it('exposes a guarded DELETE users/me route', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      UsersController.prototype,
      'removeMe',
    )?.value;

    if (typeof handler !== 'function') {
      throw new Error('Users delete route handler is not defined.');
    }

    const controllerPath: unknown = Reflect.getMetadata(
      PATH_METADATA,
      UsersController,
    );
    const methodPath: unknown = Reflect.getMetadata(PATH_METADATA, handler);
    const requestMethod: unknown = Reflect.getMetadata(
      METHOD_METADATA,
      handler,
    );
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      UsersController,
    ) as unknown[];

    expect(controllerPath).toBe('users');
    expect(methodPath).toBe('me');
    expect(requestMethod).toBe(RequestMethod.DELETE);
    expect(guards).toContain(JwtAuthGuard);
  });
});
