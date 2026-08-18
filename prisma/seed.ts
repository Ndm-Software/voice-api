import 'dotenv/config';

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL bulunamadı.');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log('Language seed başlatılıyor...');

  await prisma.language.upsert({
    where: {
      code: 'TR',
    },
    update: {
      name: 'Türkçe',
      voiceName: 'Burcu',
    },
    create: {
      code: 'TR',
      name: 'Türkçe',
      voiceName: 'Burcu',
    },
  });

  console.log('TR dili hazır.');

  await prisma.language.upsert({
    where: {
      code: 'EN',
    },
    update: {
      name: 'English',
      voiceName: 'Joanna',
    },
    create: {
      code: 'EN',
      name: 'English',
      voiceName: 'Joanna',
    },
  });

  console.log('EN dili hazır.');

  console.log('Language seed başarıyla tamamlandı.');
}

main()
  .catch((error) => {
    console.error('Seed sırasında hata oluştu:');
    console.error(error);

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });