import { Injectable, NotFoundException } from '@nestjs/common';

import { HistoryStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReminderHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    reminderId: string;
    historyType: 'PUSH' | 'VOICE_CALL';
    status: HistoryStatus;
    provider?: string;
    sentAt?: Date;
    attempt?: number;
    errorMessage?: string;
  }) {
    return this.prisma.reminderHistory.create({
      data: {
        reminderId: data.reminderId,
        historyType: data.historyType,
        status: data.status,
        provider: data.provider,
        sentAt: data.sentAt,
        attempt: data.attempt ?? 0,
        errorMessage: data.errorMessage,
      },
    });
  }

  async findAll(userId: string, reminderId?: string) {
    return this.prisma.reminderHistory.findMany({
      where: {
        ...(reminderId && { reminderId }),
        reminder: {
          userId,
        },
      },
      orderBy: {
        sentAt: 'desc',
      },
    });
  }

  async findOne(userId: string, historyId: string) {
    const history = await this.prisma.reminderHistory.findFirst({
      where: {
        historyId,
        reminder: {
          userId,
        },
      },
    });

    if (!history) {
      throw new NotFoundException('Reminder history not found.');
    }

    return history;
  }

  async updateStatus(
    historyId: string,
    status: HistoryStatus,
    errorMessage?: string,
  ) {
    // Not: Background processor'lar çalıştırırken userId bilmeyebilir,
    // bu nedenle updateStatus kendi içinde findUnique kullanmaya devam edebilir.
    const history = await this.prisma.reminderHistory.findUnique({
      where: { historyId },
    });

    if (!history) {
      throw new NotFoundException('Reminder history not found.');
    }

    return this.prisma.reminderHistory.update({
      where: {
        historyId: history.historyId,
      },
      data: {
        status,
        sentAt: status === HistoryStatus.SUCCESS ? new Date() : undefined,
        errorMessage,
      },
    });
  }

  async remove(userId: string, historyId: string) {
    const history = await this.findOne(userId, historyId);

    return this.prisma.reminderHistory.delete({
      where: { historyId: history.historyId },
    });
  }
}
