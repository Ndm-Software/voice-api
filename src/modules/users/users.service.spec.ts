import { NotFoundException } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService account deletion', () => {
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  let deleteUser: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    deleteUser = jest.fn();
    service = new UsersService({
      user: {
        delete: deleteUser,
      },
    } as unknown as PrismaService);
  });

  it('deletes the account with a single database query', async () => {
    deleteUser.mockResolvedValue({ userId });

    await expect(service.remove(userId)).resolves.toEqual({
      message: 'Kullanıcı hesabı başarıyla silindi.',
    });
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith({
      where: {
        userId,
      },
    });
  });

  it('maps a missing database row to a 404 response', async () => {
    deleteUser.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '7.9.1',
      }),
    );

    await expect(service.remove(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not hide unexpected database errors', async () => {
    const databaseError = new Error('database unavailable');

    deleteUser.mockRejectedValue(databaseError);

    await expect(service.remove(userId)).rejects.toBe(databaseError);
  });
});
