import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  DateTime,
  IANAZone,
} from 'luxon';

@Injectable()
export class TimezoneService {
  toUtc(
    dateTime: string,
    timezone: string,
  ): Date {
    if (!IANAZone.isValidZone(timezone)) {
      throw new BadRequestException(
        `Geçersiz timezone: ${timezone}`,
      );
    }

    const parsed = DateTime.fromISO(
      dateTime,
      {
        zone: timezone,
      },
    );

    if (!parsed.isValid) {
      throw new BadRequestException(
        'Geçersiz tarih/saat.',
      );
    }

    return parsed.toUTC().toJSDate();
  }

  toLocal(
    date: Date,
    timezone: string,
  ): string {
    if (!IANAZone.isValidZone(timezone)) {
      throw new BadRequestException(
        `Geçersiz timezone: ${timezone}`,
      );
    }

    const localDateTime = DateTime
      .fromJSDate(date, {
        zone: 'utc',
      })
      .setZone(timezone)
      .toISO();

    if (!localDateTime) {
      throw new BadRequestException(
        'Tarih local timezone değerine dönüştürülemedi.',
      );
    }

    return localDateTime;
  }
}