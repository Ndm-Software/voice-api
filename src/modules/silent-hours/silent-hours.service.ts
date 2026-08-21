import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DayOfWeek } from '../../generated/prisma/enums';
import type { SilentHourModel } from '../../generated/prisma/models/SilentHour';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSilentHourDto } from './dto/create-silent-hour.dto/create-silent-hour.dto';
import { UpdateSilentHourDto } from './dto/update-silent-hour.dto/update-silent-hour.dto';

const DAY_ORDER: Record<DayOfWeek, number> = {
  [DayOfWeek.MONDAY]: 1,
  [DayOfWeek.TUESDAY]: 2,
  [DayOfWeek.WEDNESDAY]: 3,
  [DayOfWeek.THURSDAY]: 4,
  [DayOfWeek.FRIDAY]: 5,
  [DayOfWeek.SATURDAY]: 6,
  [DayOfWeek.SUNDAY]: 7,
};

@Injectable()
export class SilentHoursService {
  constructor(private readonly prisma: PrismaService) {}

  private timeToDate(time: string): Date {
    return new Date(`1970-01-01T${time}:00.000Z`);
  }

  private dateToTime(date: Date): string {
    return date.toISOString().substring(11, 16);
  }

  async create(userId: string, dto: CreateSilentHourDto) {
    this.validateTimeRange(dto.silentStart, dto.silentEnd);

    const existing = await this.prisma.silentHour.findFirst({
      where: {
        userId,
        dayOfWeek: dto.dayOfWeek,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Her gün için sadece bir tane sessiz saat oluşturulabilir.',
      );
    }

    const silentHour = await this.prisma.silentHour.create({
      data: {
        userId,
        dayOfWeek: dto.dayOfWeek,
        silentStart: this.timeToDate(dto.silentStart),
        silentEnd: this.timeToDate(dto.silentEnd),
      },
    });

    return this.formatResponse(silentHour);
  }

  async findAll(userId: string) {
    const silentHours = await this.prisma.silentHour.findMany({
      where: {
        userId,
      },
      orderBy: {
        silentStart: 'asc',
      },
    });

    return silentHours
      .sort((first, second) => {
        return DAY_ORDER[first.dayOfWeek] - DAY_ORDER[second.dayOfWeek];
      })
      .map((silentHour) => this.formatResponse(silentHour));
  }

  async findOne(userId: string, silentHourId: string) {
    const silentHour = await this.prisma.silentHour.findFirst({
      where: {
        silentHourId,
        userId,
      },
    });

    if (!silentHour) {
      throw new NotFoundException('Silent hour not found.');
    }

    return this.formatResponse(silentHour);
  }

  async update(userId: string, silentHourId: string, dto: UpdateSilentHourDto) {
    const existing = await this.prisma.silentHour.findFirst({
      where: {
        silentHourId,
        userId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Silent hour not found.');
    }

    const dayOfWeek = dto.dayOfWeek ?? existing.dayOfWeek;
    const silentStart =
      dto.silentStart ?? this.dateToTime(existing.silentStart);
    const silentEnd = dto.silentEnd ?? this.dateToTime(existing.silentEnd);

    this.validateTimeRange(silentStart, silentEnd);

    if (dayOfWeek !== existing.dayOfWeek) {
      const sameDay = await this.prisma.silentHour.findFirst({
        where: {
          userId,
          dayOfWeek,
        },
      });

      if (sameDay) {
        throw new ConflictException(
          'Only one silent hour can be created per day.',
        );
      }
    }

    const silentHour = await this.prisma.silentHour.update({
      where: {
        silentHourId,
      },
      data: {
        ...(dto.dayOfWeek !== undefined && {
          dayOfWeek: dto.dayOfWeek,
        }),

        ...(dto.silentStart !== undefined && {
          silentStart: this.timeToDate(dto.silentStart),
        }),

        ...(dto.silentEnd !== undefined && {
          silentEnd: this.timeToDate(dto.silentEnd),
        }),
      },
    });

    return this.formatResponse(silentHour);
  }

  async remove(userId: string, silentHourId: string) {
    const existing = await this.prisma.silentHour.findFirst({
      where: {
        silentHourId,
        userId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Silent hour not found.');
    }

    await this.prisma.silentHour.delete({
      where: {
        silentHourId,
      },
    });

    return {
      success: true,
      message: 'Silent hour deleted successfully.',
    };
  }

  private formatResponse(silentHour: SilentHourModel) {
    return {
      silentHourId: silentHour.silentHourId,
      userId: silentHour.userId,
      dayOfWeek: silentHour.dayOfWeek,
      silentStart: this.dateToTime(silentHour.silentStart),
      silentEnd: this.dateToTime(silentHour.silentEnd),
      createdAt: silentHour.createdAt,
      updatedAt: silentHour.updatedAt,
    };
  }

  private validateTimeRange(silentStart: string, silentEnd: string) {
    if (silentStart === silentEnd) {
      throw new BadRequestException(
        'silentStart and silentEnd must be different.',
      );
    }
  }
}
