import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { ValidationError } from 'class-validator';

import { AppModule } from './app.module';
import { createCorsOptions } from './common/config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const corsOptions = createCorsOptions(
    configService.get<string>('FRONTEND_URL'),
  );
  const trustProxyHops = configService.get<number>('app.trustProxyHops') ?? 0;

  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  app.setGlobalPrefix('api');

  app.enableCors(corsOptions);

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: {
        target: false,
        value: false,
      },
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException(errors),
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
