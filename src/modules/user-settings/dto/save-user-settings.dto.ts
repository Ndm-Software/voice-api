import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SaveUserSettingsDto {
  /**
   * Languages tablosundaki dilin ID değeri.
   */
  @IsInt({ message: 'Dil ID değeri tam sayı olmalıdır.' })
  @Min(1, { message: 'Geçerli bir dil seçilmelidir.' })
  languageId!: number;

  /**
   * IANA timezone değeri.
   * Örnek: Europe/Istanbul
   *
   * Formatın gerçekten geçerli olup olmadığı
   * service katmanında Luxon ile kontrol edilecek.
   */
  @IsString()
  @IsNotEmpty({ message: 'Saat dilimi zorunludur.' })
  @MaxLength(100)
  timezone!: string;

  @IsString()
  @IsNotEmpty({ message: 'İl bilgisi zorunludur.' })
  @MaxLength(100)
  province!: string;

  @IsBoolean({
    message: 'Bildirim tercihi true veya false olmalıdır.',
  })
  notificationsEnabled!: boolean;

  /**
   * Hatırlatma zamanından kaç dakika önce
   * push bildirimi gönderileceğini belirtir.
   */
  @IsInt({
    message: 'Push bildirim süresi tam sayı olmalıdır.',
  })
  @Min(0)
  @Max(10080, {
    message: 'Push bildirim süresi en fazla 7 gün olabilir.',
  })
  defaultPushBefore!: number;

  /**
   * Hatırlatma zamanından kaç dakika önce
   * sesli arama yapılacağını belirtir.
   */
  @IsInt({
    message: 'Arama süresi tam sayı olmalıdır.',
  })
  @Min(0)
  @Max(10080, {
    message: 'Arama süresi en fazla 7 gün olabilir.',
  })
  defaultCallBefore!: number;
}