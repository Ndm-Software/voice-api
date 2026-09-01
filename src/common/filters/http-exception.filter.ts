import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ValidationIssue {
  property: string;
  constraints?: Record<string, string>;
  children?: ValidationIssue[];
}

type ApiErrorMessage = string | string[] | ValidationIssue[];

interface ErrorDetails {
  message: ApiErrorMessage;
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
}

export interface ApiErrorResponse extends ErrorDetails {
  success: false;
  statusCode: number;
  timestamp: string;
  path: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorDetails = isHttpException
      ? this.createHttpErrorDetails(exception)
      : this.createInternalErrorDetails();

    if (!isHttpException) {
      this.logUnexpectedError(request);
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      ...errorDetails,
      timestamp: new Date().toISOString(),
      path: request.path,
    } satisfies ApiErrorResponse);
  }

  private createHttpErrorDetails(exception: HttpException): ErrorDetails {
    const exceptionResponse = exception.getResponse();
    const details: ErrorDetails = {
      message: this.readMessage(exceptionResponse),
    };

    if (!isRecord(exceptionResponse)) {
      return details;
    }

    const error = exceptionResponse.error;
    const code = exceptionResponse.code;
    const retryAfterSeconds = exceptionResponse.retryAfterSeconds;

    if (typeof error === 'string' && error.trim().length > 0) {
      details.error = error.trim();
    }

    if (typeof code === 'string' && /^[A-Z0-9_]{1,100}$/.test(code.trim())) {
      details.code = code.trim();
    }

    if (
      typeof retryAfterSeconds === 'number' &&
      Number.isInteger(retryAfterSeconds) &&
      retryAfterSeconds > 0
    ) {
      details.retryAfterSeconds = retryAfterSeconds;
    }

    return details;
  }

  private createInternalErrorDetails(): ErrorDetails {
    return {
      message: 'Internal server error.',
      error: 'Internal Server Error',
    };
  }

  private readMessage(exceptionResponse: unknown): ApiErrorMessage {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (Array.isArray(exceptionResponse)) {
      return this.sanitizeMessageArray(exceptionResponse);
    }

    if (isRecord(exceptionResponse)) {
      const message = exceptionResponse.message;

      if (typeof message === 'string') {
        return message;
      }

      if (Array.isArray(message)) {
        return this.sanitizeMessageArray(message);
      }
    }

    return 'Request failed.';
  }

  private sanitizeMessageArray(message: unknown[]): ApiErrorMessage {
    if (message.every((item) => typeof item === 'string')) {
      return message;
    }

    const validationIssues = message
      .map((item) => this.sanitizeValidationIssue(item))
      .filter((item): item is ValidationIssue => item !== undefined);

    return validationIssues.length > 0 ? validationIssues : 'Request failed.';
  }

  private sanitizeValidationIssue(value: unknown): ValidationIssue | undefined {
    if (!isRecord(value) || typeof value.property !== 'string') {
      return undefined;
    }

    const issue: ValidationIssue = {
      property: value.property,
    };

    if (isRecord(value.constraints)) {
      const constraints = Object.fromEntries(
        Object.entries(value.constraints).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );

      if (Object.keys(constraints).length > 0) {
        issue.constraints = constraints;
      }
    }

    if (Array.isArray(value.children)) {
      const children = value.children
        .map((child) => this.sanitizeValidationIssue(child))
        .filter((child): child is ValidationIssue => child !== undefined);

      if (children.length > 0) {
        issue.children = children;
      }
    }

    return issue;
  }

  private logUnexpectedError(request: Request): void {
    const route = (request as unknown as { route?: unknown }).route;
    const routePath = isRecord(route) ? route.path : undefined;
    const safeRoutePath =
      typeof routePath === 'string' ? routePath : 'unmatched-route';

    this.logger.error(
      `Unhandled request error: ${request.method} ${safeRoutePath}`,
    );
  }
}
