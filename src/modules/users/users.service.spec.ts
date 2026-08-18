import { ConflictException, NotFoundException } from '@nestjs/common';

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

describe('UsersService user creation', () => {
  let findUnique: jest.Mock;
  let createUser: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue(null);
    createUser = jest.fn().mockResolvedValue({
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      phoneVerified: true,
    });
    service = new UsersService({
      user: {
        findUnique,
        create: createUser,
      },
    } as unknown as PrismaService);
  });

  it('creates an OTP-verified user in one database write', async () => {
    await service.create({
      firstName: ' Test ',
      lastName: ' User ',
      email: ' USER@EXAMPLE.COM ',
      phoneNumber: ' +905551112233 ',
      passwordHash: 'bcrypt-hash',
      phoneVerified: true,
    });

    expect(createUser).toHaveBeenCalledWith({
      data: {
        firstName: 'Test',
        lastName: 'User',
        email: 'user@example.com',
        phoneNumber: '+905551112233',
        passwordHash: 'bcrypt-hash',
        phoneVerified: true,
      },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        phoneVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it('preserves the unverified default for non-OTP callers', async () => {
    await service.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      phoneNumber: '+905551112233',
      passwordHash: 'bcrypt-hash',
    });

    const createCalls = createUser.mock.calls as unknown[][];
    const input = createCalls[0][0] as {
      data: { phoneVerified: boolean };
    };

    expect(input.data.phoneVerified).toBe(false);
  });

  it('maps a concurrent unique collision to a conflict', async () => {
    createUser.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.9.1',
      }),
    );

    await expect(
      service.create({
        firstName: 'Test',
        lastName: 'User',
        email: 'user@example.com',
        phoneNumber: '+905551112233',
        passwordHash: 'bcrypt-hash',
        phoneVerified: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
