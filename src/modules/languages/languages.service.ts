import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateLanguageDto } from './dto/create-language.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';

const languageSelect = {
  languageId: true,
  code: true,
  name: true,
  voiceName: true,
} as const;

@Injectable()
export class LanguagesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.language.findMany({
      select: languageSelect,
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findById(languageId: number) {
    const language = await this.prisma.language.findUnique({
      where: {
        languageId,
      },
      select: languageSelect,
    });

    if (!language) {
      throw new NotFoundException('Dil bulunamadı.');
    }

    return language;
  }

  async findByCode(code: string) {
    const normalizedCode = code.trim().toUpperCase();

    const language = await this.prisma.language.findUnique({
      where: {
        code: normalizedCode,
      },
      select: languageSelect,
    });

    if (!language) {
      throw new NotFoundException('Dil bulunamadı.');
    }

    return language;
  }

  async create(dto: CreateLanguageDto) {
    const normalizedCode = dto.code.trim().toUpperCase();

    const existingLanguage = await this.prisma.language.findUnique({
      where: {
        code: normalizedCode,
      },
    });

    if (existingLanguage) {
      throw new ConflictException(
        'Bu dil koduyla kayıtlı bir dil zaten var.',
      );
    }

    return this.prisma.language.create({
      data: {
        code: normalizedCode,
        name: dto.name.trim(),
        voiceName: dto.voiceName.trim(),
      },
      select: languageSelect,
    });
  }

  async update(
    languageId: number,
    dto: UpdateLanguageDto,
  ) {
    await this.findById(languageId);

    const normalizedCode = dto.code?.trim().toUpperCase();

    if (normalizedCode) {
      const existingLanguage =
        await this.prisma.language.findUnique({
          where: {
            code: normalizedCode,
          },
        });

      if (
        existingLanguage &&
        existingLanguage.languageId !== languageId
      ) {
        throw new ConflictException(
          'Bu dil kodu başka bir dil tarafından kullanılıyor.',
        );
      }
    }

    return this.prisma.language.update({
      where: {
        languageId,
      },
      data: {
        ...(normalizedCode !== undefined
          ? {
              code: normalizedCode,
            }
          : {}),

        ...(dto.name !== undefined
          ? {
              name: dto.name.trim(),
            }
          : {}),

        ...(dto.voiceName !== undefined
          ? {
              voiceName: dto.voiceName.trim(),
            }
          : {}),
      },
      select: languageSelect,
    });
  }

  async remove(languageId: number) {
    await this.findById(languageId);

    const relatedSettingsCount =
      await this.prisma.userSetting.count({
        where: {
          languageId,
        },
      });

    if (relatedSettingsCount > 0) {
      throw new ConflictException(
        'Bu dil kullanıcı ayarlarında kullanıldığı için silinemez.',
      );
    }

    await this.prisma.language.delete({
      where: {
        languageId,
      },
    });

    return {
      message: 'Dil başarıyla silindi.',
    };
  }
}