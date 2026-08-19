import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  const createHost = (request: Partial<Request>) => {
    let responseBody: unknown;
    const json = jest.fn((body: unknown): void => {
      responseBody = body;
    });
    const status = jest
      .fn<(statusCode: number) => { json: typeof json }>()
      .mockReturnValue({ json });
    const response = { status, json } as unknown as Response;
    const host = {
      switchToHttp: () => ({
        getRequest: () => request as Request,
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    return {
      host,
      json,
      status,
      getResponseBody: () => responseBody,
    };
  };

  it('preserves approved domain error fields in the standard response', () => {
    const { host, json, status } = createHost({ path: '/api/example' });

    new HttpExceptionFilter().catch(
      new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Invalid request.',
        retryAfterSeconds: 30,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      success: false,
      statusCode: 400,
      code: 'INVALID_REQUEST',
      message: 'Invalid request.',
      retryAfterSeconds: 30,
      timestamp: expect.any(String) as unknown,
      path: '/api/example',
    });
  });

  it('removes validation targets and values from error responses', () => {
    const secret = 'must-not-leak';
    const { host, getResponseBody } = createHost({ path: '/api/register' });

    new HttpExceptionFilter().catch(
      new BadRequestException([
        {
          property: 'password',
          target: { password: secret },
          value: secret,
          constraints: {
            minLength: 'password must be longer',
          },
        },
      ]),
      host,
    );

    const responseBody = getResponseBody();

    expect(JSON.stringify(responseBody)).not.toContain(secret);
    expect(responseBody).toMatchObject({
      success: false,
      statusCode: 400,
      message: [
        {
          property: 'password',
          constraints: {
            minLength: 'password must be longer',
          },
        },
      ],
    });
  });

  it('returns and logs only safe metadata for unexpected errors', () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, getResponseBody, status } = createHost({
      method: 'POST',
      path: '/api/failure',
      originalUrl: '/api/failure?token=query-secret',
      route: { path: '/failure' },
    });

    new HttpExceptionFilter().catch(
      new Error('provider response contained secret-value'),
      host,
    );

    const responseBody = getResponseBody();
    const serializedLog = JSON.stringify(logger.mock.calls);

    expect(status).toHaveBeenCalledWith(500);
    expect(responseBody).toMatchObject({
      success: false,
      statusCode: 500,
      message: 'Internal server error.',
      error: 'Internal Server Error',
      path: '/api/failure',
    });
    expect(JSON.stringify(responseBody)).not.toContain('secret-value');
    expect(serializedLog).not.toContain('secret-value');
    expect(serializedLog).not.toContain('query-secret');
    expect(logger).toHaveBeenCalledWith(
      'Unhandled request error: POST /failure',
    );

    logger.mockRestore();
  });
});
