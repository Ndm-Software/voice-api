import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
  Logger,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

@Controller('common-response')
class CommonResponseTestController {
  @Get('success')
  getSuccess() {
    return { value: 'ok' };
  }

  @Get('known-error')
  getKnownError(): never {
    throw new BadRequestException({
      code: 'TEST_REQUEST_INVALID',
      message: 'Test request is invalid.',
    });
  }

  @Get('unexpected-error')
  getUnexpectedError(): never {
    throw new Error('sensitive-provider-detail');
  }
}

describe('Common HTTP response contract (e2e)', () => {
  let app: INestApplication;
  let server: App;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CommonResponseTestController],
      providers: [
        {
          provide: APP_FILTER,
          useClass: HttpExceptionFilter,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: ResponseInterceptor,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  it('wraps successful HTTP responses', async () => {
    const response = await request(server)
      .get('/common-response/success')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      statusCode: 200,
      data: { value: 'ok' },
      timestamp: expect.any(String) as unknown,
      path: '/common-response/success',
    });
  });

  it('formats known HTTP exceptions and preserves their code', async () => {
    const response = await request(server)
      .get('/common-response/known-error')
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      statusCode: 400,
      code: 'TEST_REQUEST_INVALID',
      message: 'Test request is invalid.',
      timestamp: expect.any(String) as unknown,
      path: '/common-response/known-error',
    });
  });

  it('does not expose unexpected error details in responses or logs', async () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const response = await request(server)
      .get('/common-response/unexpected-error?token=query-detail')
      .expect(500);
    const serializedLog = JSON.stringify(logger.mock.calls);

    expect(response.body).toEqual({
      success: false,
      statusCode: 500,
      message: 'Internal server error.',
      error: 'Internal Server Error',
      timestamp: expect.any(String) as unknown,
      path: '/common-response/unexpected-error',
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'sensitive-provider-detail',
    );
    expect(serializedLog).not.toContain('sensitive-provider-detail');
    expect(serializedLog).not.toContain('query-detail');

    logger.mockRestore();
  });
});
