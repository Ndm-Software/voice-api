import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VOIA Backend API')
    .setDescription(
      'VOIA reminder, notification, voice call, authentication and user management API.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT access token',
      },
      'access-token',
    )
    .build();

  const swaggerDocumentFactory = () =>
    SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, swaggerDocumentFactory, {
    useGlobalPrefix: true,
    customSiteTitle: 'VOIA Backend API Docs',
  });

  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
