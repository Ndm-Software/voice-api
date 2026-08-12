import { createHash } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

const transactionRetryLimit = 3;

const deviceResponseSelect = {
  deviceId: true,
  platform: true,
  deviceName: true,
  lastActive: true,
  isActive: true,
  createdAt: true,
} as const;

const isPrismaError = (
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError =>
  error instanceof Prisma.PrismaClientKnownRequestError;

const hashPushToken = (pushToken: string): string =>
  createHash('sha256').update(pushToken, 'utf8').digest('hex');

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForUser(userId: string) {
    return this.prisma.device.findMany({
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
      select: deviceResponseSelect,
    });
  }

  async requireActiveOwnedDevice(
    userId: string,
    deviceId: string,
  ): Promise<{ deviceId: string }> {
    const device = await this.prisma.device.findFirst({
      where: {
        deviceId,
        userId,
        isActive: true,
      },
      select: {
        deviceId: true,
      },
    });

    if (!device) {
      throw new NotFoundException('Aktif cihaz bulunamadı.');
    }

    return device;
  }

  async deactivateOwnedDevice(
    userId: string,
    deviceId: string,
  ): Promise<boolean> {
    const result = await this.prisma.device.updateMany({
      where: {
        deviceId,
        userId,
      },
      data: {
        isActive: false,
        pushToken: null,
        pushTokenHash: null,
      },
    });

    return result.count > 0;
  }

  async registerOrUpdate(userId: string, dto: RegisterDeviceDto) {
    let attempt = 0;

    while (true) {
      try {
        return await this.prisma.$transaction(
          (transaction) =>
            this.registerOrUpdateInTransaction(transaction, userId, dto),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        attempt += 1;

        if (
          isPrismaError(error) &&
          error.code === 'P2034' &&
          attempt < transactionRetryLimit
        ) {
          continue;
        }

        if (isPrismaError(error) && error.code === 'P2002') {
          throw new ConflictException(
            'Cihaz kaydı mevcut bir oturumla çakışıyor.',
          );
        }

        throw error;
      }
    }
  }

  private async registerOrUpdateInTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    dto: RegisterDeviceDto,
  ) {
    const activeDeviceForAnotherUser = await transaction.device.findFirst({
      where: {
        installationId: dto.installationId,
        isActive: true,
        userId: {
          not: userId,
        },
      },
      select: {
        deviceId: true,
      },
    });

    if (activeDeviceForAnotherUser) {
      throw new ConflictException(
        'Bu cihazda başka bir hesap oturumu aktif. Hesap değiştirmeden önce çıkış yapın.',
      );
    }

    await this.releasePushTokenFromPreviousDevice(transaction, userId, dto);

    const lastActive = new Date();
    const pushTokenData =
      dto.pushToken !== undefined
        ? {
            pushToken: dto.pushToken,
            pushTokenHash: hashPushToken(dto.pushToken),
          }
        : {};

    return transaction.device.upsert({
      where: {
        userId_installationId: {
          userId,
          installationId: dto.installationId,
        },
      },
      create: {
        userId,
        installationId: dto.installationId,
        platform: dto.platform,
        deviceName: dto.deviceName,
        lastActive,
        isActive: true,
        ...pushTokenData,
      },
      update: {
        platform: dto.platform,
        deviceName: dto.deviceName,
        lastActive,
        isActive: true,
        ...pushTokenData,
      },
      select: deviceResponseSelect,
    });
  }

  private async releasePushTokenFromPreviousDevice(
    transaction: Prisma.TransactionClient,
    userId: string,
    dto: RegisterDeviceDto,
  ) {
    if (dto.pushToken === undefined) {
      return;
    }

    const previousDevice = await transaction.device.findUnique({
      where: {
        pushTokenHash: hashPushToken(dto.pushToken),
      },
      select: {
        deviceId: true,
        userId: true,
        installationId: true,
        isActive: true,
      },
    });

    if (
      !previousDevice ||
      (previousDevice.userId === userId &&
        previousDevice.installationId === dto.installationId)
    ) {
      return;
    }

    if (previousDevice.isActive && previousDevice.userId !== userId) {
      throw new ConflictException(
        'Bildirim anahtarı başka bir aktif cihaz oturumuna bağlı.',
      );
    }

    await transaction.device.update({
      where: {
        deviceId: previousDevice.deviceId,
      },
      data: {
        pushToken: null,
        pushTokenHash: null,
        isActive: false,
      },
    });
  }
}
