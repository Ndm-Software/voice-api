import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IANAZone } from 'luxon';

import { PrismaService } from '../../prisma/prisma.service';
import { LanguagesService } from '../languages/languages.service';
import { SaveUserSettingsDto } from './dto/save-user-settings.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';

/**
 * API response içinde dönmesini istediğimiz alanlar.
 *
 * languageId yerine yalnızca ilişkiyi değil,
 * kullanıcının seçtiği dilin detaylarını da döndürüyoruz.
 */
const userSettingsSelect = {
  settingId: true,
  userId: true,
  languageId: true,
  timezone: true,
  province: true,
  notificationsEnabled: true,
  defaultPushBefore: true,
  defaultCallBefore: true,
  emergencyOverride: true,
  createdAt: true,
  updatedAt: true,

  language: {
    select: {
      languageId: true,
      code: true,
      name: true,
      voiceName: true,
    },
  },
} as const;

@Injectable()
export class UserSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly languagesService: LanguagesService,
  ) {}

  /**
   * Giriş yapan kullanıcının ayarlarını getirir.
   */
  async findMine(userId: string) {
    const settings = await this.prisma.userSetting.findUnique({
      where: {
        userId,
      },
      select: userSettingsSelect,
    });

    if (!settings) {
      throw new NotFoundException('Kullanıcı ayarları henüz oluşturulmamış.');
    }

    return settings;
  }

  /**
   * Kullanıcının ayarlarını oluşturur veya tamamen günceller.
   *
   * upsert:
   * - Kayıt yoksa create
   * - Kayıt varsa update
   */
  async save(userId: string, dto: SaveUserSettingsDto) {
    await this.validateLanguage(dto.languageId);
    this.validateTimezone(dto.timezone);

    const normalizedTimezone = dto.timezone.trim();
    const normalizedProvince = dto.province.trim();

    return this.prisma.userSetting.upsert({
      where: {
        userId,
      },

      create: {
        userId,
        languageId: dto.languageId,
        timezone: normalizedTimezone,
        province: normalizedProvince,
        notificationsEnabled: dto.notificationsEnabled,
        defaultPushBefore: dto.defaultPushBefore,
        defaultCallBefore: dto.defaultCallBefore,

        /**
         * MVP'de acil durum override özelliği
         * kullanıcı tarafından yönetilmiyor.
         */
        emergencyOverride: false,
      },

      update: {
        languageId: dto.languageId,
        timezone: normalizedTimezone,
        province: normalizedProvince,
        notificationsEnabled: dto.notificationsEnabled,
        defaultPushBefore: dto.defaultPushBefore,
        defaultCallBefore: dto.defaultCallBefore,

        /**
         * PUT işleminde de kullanıcının bu alanı
         * değiştirmesine izin vermiyoruz.
         */
        emergencyOverride: false,
      },

      select: userSettingsSelect,
    });
  }

  /**
   * Sadece gönderilen kullanıcı ayarlarını günceller.
   */
  async update(userId: string, dto: UpdateUserSettingsDto) {
    await this.ensureSettingsExist(userId);

    if (dto.languageId !== undefined) {
      await this.validateLanguage(dto.languageId);
    }

    if (dto.timezone !== undefined) {
      this.validateTimezone(dto.timezone);
    }

    return this.prisma.userSetting.update({
      where: {
        userId,
      },

      data: {
        ...(dto.languageId !== undefined
          ? {
              languageId: dto.languageId,
            }
          : {}),

        ...(dto.timezone !== undefined
          ? {
              timezone: dto.timezone.trim(),
            }
          : {}),

        ...(dto.province !== undefined
          ? {
              province: dto.province.trim(),
            }
          : {}),

        ...(dto.notificationsEnabled !== undefined
          ? {
              notificationsEnabled: dto.notificationsEnabled,
            }
          : {}),

        ...(dto.defaultPushBefore !== undefined
          ? {
              defaultPushBefore: dto.defaultPushBefore,
            }
          : {}),

        ...(dto.defaultCallBefore !== undefined
          ? {
              defaultCallBefore: dto.defaultCallBefore,
            }
          : {}),
      },

      select: userSettingsSelect,
    });
  }

  /**
   * UserSetting kaydı var mı kontrol eder.
   *
   * PATCH işleminde kayıt yoksa update yapamayız.
   */
  private async ensureSettingsExist(userId: string): Promise<void> {
    const settings = await this.prisma.userSetting.findUnique({
      where: {
        userId,
      },
      select: {
        settingId: true,
      },
    });

    if (!settings) {
      throw new NotFoundException('Kullanıcı ayarları henüz oluşturulmamış.');
    }
  }

  /**
   * Gönderilen languageId gerçekten Languages
   * tablosunda var mı kontrol eder.
   */
  private async validateLanguage(languageId: string): Promise<void> {
    await this.languagesService.findById(languageId);
  }

  /**
   * Timezone değerinin geçerli bir IANA timezone
   * olup olmadığını kontrol eder.
   */
  private validateTimezone(timezone: string): void {
    const normalizedTimezone = timezone.trim();

    if (!IANAZone.isValidZone(normalizedTimezone)) {
      throw new BadRequestException(
        'Geçersiz saat dilimi. Örnek: Europe/Istanbul',
      );
    }
  }
}
