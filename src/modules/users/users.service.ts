import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * AuthService register sırasında bu veri yapısını kullanacak.
 *
 * Kullanıcı dışarıdan passwordHash göndermez.
 * AuthService düz şifreyi hashler ve bu servise passwordHash olarak yollar.
 */
export interface CreateUserData {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
}

/**
 * API cevaplarında passwordHash dönmemesi için
 * yalnızca güvenli kullanıcı alanlarını seçiyoruz.
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
   * Kullanıcıyı ID ile getirir.
   *
   * Kullanıcı bulunamazsa 404 Not Found hatası verir.
   * passwordHash response içerisinde dönmez.
   */
  async findById(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: {
        userId,
      },
      select: safeUserSelect,
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    return user;
  }

  /**
   * Kullanıcıyı email adresine göre bulur.
   *
   * Auth modülü bunu register ve login sırasında kullanacak.
   * Burada passwordHash alanına ihtiyaç olabileceği için
   * safeUserSelect kullanmıyoruz.
   *
   * Bu metodun sonucunu doğrudan API response olarak döndürmemeliyiz.
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
   * Aynı telefon numarasıyla birden fazla hesap
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
   * Bu metot doğrudan UsersController tarafından çağrılmayacak.
   * AuthService register işleminde şifreyi hashledikten sonra çağıracak.
   */
  async create(data: CreateUserData) {
    const normalizedEmail = data.email.trim().toLowerCase();

    const existingEmail = await this.findByEmail(normalizedEmail);

    if (existingEmail) {
      throw new ConflictException(
        'Bu e-posta adresiyle kayıtlı bir kullanıcı zaten var.',
      );
    }

    const existingPhone = await this.findByPhoneNumber(data.phoneNumber);

    if (existingPhone) {
      throw new ConflictException(
        'Bu telefon numarasıyla kayıtlı bir kullanıcı zaten var.',
      );
    }

    return this.prisma.user.create({
      data: {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: normalizedEmail,
        phoneNumber: data.phoneNumber,
        passwordHash: data.passwordHash,
      },
      select: safeUserSelect,
    });
  }

  /**
   * Kullanıcının profil bilgilerini günceller.
   *
   * Güncellenebilen alanlar UpdateUserDto içerisinde belirlenir.
   */
  async update(userId: number, dto: UpdateUserDto) {
    await this.findById(userId);

    const normalizedEmail = dto.email?.trim().toLowerCase();

    if (normalizedEmail) {
      const existingEmail = await this.findByEmail(normalizedEmail);

      if (existingEmail && existingEmail.userId !== userId) {
        throw new ConflictException(
          'Bu e-posta adresi başka bir kullanıcı tarafından kullanılıyor.',
        );
      }
    }

    if (dto.phoneNumber) {
      const existingPhone = await this.findByPhoneNumber(dto.phoneNumber);

      if (existingPhone && existingPhone.userId !== userId) {
        throw new ConflictException(
          'Bu telefon numarası başka bir kullanıcı tarafından kullanılıyor.',
        );
      }
    }

    const phoneNumberChanged = dto.phoneNumber !== undefined;

    return this.prisma.user.update({
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

        ...(normalizedEmail
          ? {
              email: normalizedEmail,
            }
          : {}),

        ...(dto.phoneNumber !== undefined
          ? {
              phoneNumber: dto.phoneNumber,
            }
          : {}),

        /**
         * Telefon numarası değiştirildiyse
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
  }

  /**
   * Kullanıcı hesabını siler.
   */
  async remove(userId: number) {
    await this.findById(userId);

    await this.prisma.user.delete({
      where: {
        userId,
      },
    });

    return {
      message: 'Kullanıcı hesabı başarıyla silindi.',
    };
  }
}