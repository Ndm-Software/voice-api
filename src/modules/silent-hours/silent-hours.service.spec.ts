import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { DayOfWeek } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { SilentHoursService } from './silent-hours.service';
import { CreateSilentHourDto } from './dto/create-silent-hour.dto/create-silent-hour.dto';

describe('SilentHoursService', () => {
  let service: SilentHoursService;
  let prisma: {
    silentHour: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const userId = '22222222-2222-4222-8222-222222222222';
  const silentHourId = '33333333-3333-4333-8333-333333333333';
  const storedSilentHour = {
    silentHourId,
    userId,
    dayOfWeek: DayOfWeek.MONDAY,
    silentStart: new Date('1970-01-01T22:00:00.000Z'),
    silentEnd: new Date('1970-01-01T07:00:00.000Z'),
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    updatedAt: new Date('2026-08-20T10:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      silentHour: {
        create: jest.fn().mockResolvedValue(storedSilentHour),
        findMany: jest.fn().mockResolvedValue([storedSilentHour]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(storedSilentHour),
        delete: jest.fn().mockResolvedValue(storedSilentHour),
      },
    };
    service = new SilentHoursService(prisma as unknown as PrismaService);
  });

  it('creates a silent hour for the authenticated user', async () => {
    const dto: CreateSilentHourDto = {
      dayOfWeek: DayOfWeek.MONDAY,
      silentStart: '22:00',
      silentEnd: '07:00',
    };

    await expect(service.create(userId, dto)).resolves.toMatchObject({
      silentHourId,
      userId,
      silentStart: '22:00',
      silentEnd: '07:00',
    });
    expect(prisma.silentHour.create).toHaveBeenCalledWith({
      data: {
        userId,
        dayOfWeek: DayOfWeek.MONDAY,
        silentStart: new Date('1970-01-01T22:00:00.000Z'),
        silentEnd: new Date('1970-01-01T07:00:00.000Z'),
      },
    });
  });

  it("does not return another user's silent hour", async () => {
    prisma.silentHour.findFirst.mockResolvedValue(null);

    await expect(service.findOne(userId, silentHourId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.silentHour.findFirst).toHaveBeenCalledWith({
      where: {
        silentHourId,
        userId,
      },
    });
  });

  it('rejects a second silent hour on the same day', async () => {
    prisma.silentHour.findFirst
      .mockResolvedValueOnce(storedSilentHour)
      .mockResolvedValueOnce(null);

    await expect(
      service.create(userId, {
        dayOfWeek: DayOfWeek.MONDAY,
        silentStart: '23:00',
        silentEnd: '06:00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.silentHour.create).not.toHaveBeenCalled();
  });

  it('rejects an empty silent-hour interval', async () => {
    await expect(
      service.create(userId, {
        dayOfWeek: DayOfWeek.MONDAY,
        silentStart: '22:00',
        silentEnd: '22:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.silentHour.findFirst).not.toHaveBeenCalled();
  });

  it('returns silent hours in weekly order', async () => {
    const sunday = {
      ...storedSilentHour,
      dayOfWeek: DayOfWeek.SUNDAY,
    };
    const monday = storedSilentHour;
    prisma.silentHour.findMany.mockResolvedValue([sunday, monday]);

    await expect(service.findAll(userId)).resolves.toEqual([
      expect.objectContaining({ dayOfWeek: DayOfWeek.MONDAY }),
      expect.objectContaining({ dayOfWeek: DayOfWeek.SUNDAY }),
    ]);
  });

  it('updates a silent hour for the authenticated user', async () => {
    const dto = {
      dayOfWeek: DayOfWeek.TUESDAY,
      silentStart: '23:00',
      silentEnd: '06:00',
    };
    prisma.silentHour.findFirst
      .mockResolvedValueOnce(storedSilentHour)
      .mockResolvedValueOnce(null);

    await service.update(userId, silentHourId, dto);

    expect(prisma.silentHour.update).toHaveBeenCalledWith({
      where: { silentHourId },
      data: {
        dayOfWeek: DayOfWeek.TUESDAY,
        silentStart: new Date('1970-01-01T23:00:00.000Z'),
        silentEnd: new Date('1970-01-01T06:00:00.000Z'),
      },
    });
  });

  it('rejects moving a silent hour to an occupied day', async () => {
    prisma.silentHour.findFirst
      .mockResolvedValueOnce(storedSilentHour)
      .mockResolvedValueOnce({ ...storedSilentHour, silentHourId: 'other-id' });

    await expect(
      service.update(userId, silentHourId, {
        dayOfWeek: DayOfWeek.TUESDAY,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.silentHour.update).not.toHaveBeenCalled();
  });

  it('deletes a silent hour for the authenticated user', async () => {
    prisma.silentHour.findFirst.mockResolvedValue(storedSilentHour);

    await expect(service.remove(userId, silentHourId)).resolves.toEqual({
      success: true,
      message: 'Silent hour deleted successfully.',
    });
    expect(prisma.silentHour.delete).toHaveBeenCalledWith({
      where: { silentHourId },
    });
  });
});
