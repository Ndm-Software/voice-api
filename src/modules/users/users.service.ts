import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { getUserInitials } from '../../common/utils/user-avatar.util';

/**
 * AuthService register işlemi sırasında bu veri yapısını gönderir.
 *
 * Kullanıcı dışarıdan passwordHash göndermez.
 * AuthService düz şifreyi bcrypt ile hashler ve buraya gönderir.
 */
export interface CreateUserData {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
  phoneVerified?: boolean;
}

/**
 * Kullanıcı bilgileri API cevabında dönerken
 * passwordHash alanının kesinlikle dönmemesi için kullanılır.
 */
const safeUserSelect = {
  userId: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  phoneVerified: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kullanıcıyı ID ile bulur.
   *
   * Profil endpointleri bu metodu kullanır.
   * passwordHash response içerisinde dönmez.
   */
  async findById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        userId,
      },
      select: safeUserSelect,
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    return {
      ...user,
      initials: getUserInitials(user.firstName, user.lastName),
    };
  }

  /**
   * Kullanıcıyı e-posta adresine göre bulur.
   *
   * AuthService register ve login sırasında kullanır.
   * Login işlemi passwordHash alanına ihtiyaç duyduğu için
   * burada safeUserSelect kullanılmaz.
   *
   * Bu metodun sonucu doğrudan controller response'u olarak dönülmemelidir.
   */
  async findByEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    return this.prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });
  }

  /**
   * Kullanıcıyı telefon numarasına göre bulur.
   *
   * Aynı telefon numarasıyla birden fazla kullanıcı
   * oluşturulmasını engellemek için kullanılır.
   */
  async findByPhoneNumber(phoneNumber: string) {
    return this.prisma.user.findUnique({
      where: {
        phoneNumber,
      },
    });
  }

  /**
   * Yeni kullanıcı oluşturur.
   *
   * Bu metodu UsersController çağırmaz.
   * AuthService register sırasında şifreyi hashledikten sonra çağırır.
   */
  async create(data: CreateUserData) {
    const normalizedEmail = data.email.trim().toLowerCase();
    const normalizedPhoneNumber = data.phoneNumber.trim();

    const existingEmail = await this.findByEmail(normalizedEmail);

    if (existingEmail) {
      throw new ConflictException(
        'Bu e-posta adresiyle kayıtlı bir kullanıcı zaten var.',
      );
    }

    const existingPhone = await this.findByPhoneNumber(normalizedPhoneNumber);

    if (existingPhone) {
      throw new ConflictException(
        'Bu telefon numarasıyla kayıtlı bir kullanıcı zaten var.',
      );
    }

    try {
      return await this.prisma.user.create({
        data: {
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          email: normalizedEmail,
          phoneNumber: normalizedPhoneNumber,
          passwordHash: data.passwordHash,
          phoneVerified: data.phoneVerified ?? false,
        },
        select: safeUserSelect,
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Bu e-posta adresi veya telefon numarası kullanılıyor.',
        );
      }

      throw error;
    }
  }

  /**
   * Giriş yapan kullanıcının profil bilgilerini günceller.
   */
  async update(userId: string, dto: UpdateUserDto) {
    await this.findById(userId);

    const normalizedEmail = dto.email?.trim().toLowerCase();
    const normalizedPhoneNumber = dto.phoneNumber?.trim();

    if (normalizedEmail) {
      const existingEmail = await this.findByEmail(normalizedEmail);

      if (existingEmail && existingEmail.userId !== userId) {
        throw new ConflictException(
          'Bu e-posta adresi başka bir kullanıcı tarafından kullanılıyor.',
        );
      }
    }

    if (normalizedPhoneNumber) {
      const existingPhone = await this.findByPhoneNumber(normalizedPhoneNumber);

      if (existingPhone && existingPhone.userId !== userId) {
        throw new ConflictException(
          'Bu telefon numarası başka bir kullanıcı tarafından kullanılıyor.',
        );
      }
    }

    const currentUser = await this.prisma.user.findUnique({
      where: {
        userId,
      },
      select: {
        phoneNumber: true,
      },
    });

    if (!currentUser) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    const phoneNumberChanged =
      normalizedPhoneNumber !== undefined &&
      normalizedPhoneNumber !== currentUser.phoneNumber;

    const updatedUser = await this.prisma.user.update({
      where: {
        userId,
      },
      data: {
        ...(dto.firstName !== undefined
          ? {
              firstName: dto.firstName.trim(),
            }
          : {}),

        ...(dto.lastName !== undefined
          ? {
              lastName: dto.lastName.trim(),
            }
          : {}),

        ...(normalizedEmail !== undefined
          ? {
              email: normalizedEmail,
            }
          : {}),

        ...(normalizedPhoneNumber !== undefined
          ? {
              phoneNumber: normalizedPhoneNumber,
            }
          : {}),

        /**
         * Telefon numarası gerçekten değiştiyse
         * yeni telefon tekrar OTP ile doğrulanmalıdır.
         */
        ...(phoneNumberChanged
          ? {
              phoneVerified: false,
            }
          : {}),
      },
      select: safeUserSelect,
    });

    return {
      ...updatedUser,
      initials: getUserInitials(updatedUser.firstName, updatedUser.lastName),
    };
  }

  async remove(userId: string) {
    try {
      await this.prisma.user.delete({
        where: {
          userId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Kullanıcı bulunamadı.');
      }

      throw error;
    }

    return {
      message: 'Kullanıcı hesabı başarıyla silindi.',
    };
  }
}
