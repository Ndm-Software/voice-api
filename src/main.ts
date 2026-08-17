import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { ValidationError } from 'class-validator';

import { AppModule } from './app.module';
import { createCorsOptions } from './common/config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const corsOptions = createCorsOptions(
    configService.get<string>('FRONTEND_URL'),
  );

  app.setGlobalPrefix('api');

  app.enableCors(corsOptions);

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Testin beklediği nesne tabanlı hata yapısını doğrudan dışarı aktarıyoruz:
      exceptionFactory: (errors: ValidationError[]) => {
        return new BadRequestException(errors);
      },
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
