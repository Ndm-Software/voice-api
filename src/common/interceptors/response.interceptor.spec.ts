import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Request, Response } from 'express';
import { firstValueFrom, of } from 'rxjs';

import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  it('wraps controller data in the standard success response', async () => {
    const request = { path: '/api/example' } as Request;
    const response = { statusCode: 201 } as Response;
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as ExecutionContext;
    const next = {
      handle: () => of({ id: 'example-id' }),
    } as CallHandler<{ id: string }>;

    const result = await firstValueFrom(
      new ResponseInterceptor<{ id: string }>().intercept(context, next),
    );

    expect(result).toEqual({
      success: true,
      statusCode: 201,
      data: { id: 'example-id' },
      timestamp: expect.any(String) as unknown,
      path: '/api/example',
    });
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
