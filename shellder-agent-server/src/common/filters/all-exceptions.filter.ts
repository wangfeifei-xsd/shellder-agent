import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId =
      request.requestId ?? response.getHeader(REQUEST_ID_HEADER)?.toString() ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = this.codeFromStatus(status);
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        if (typeof obj.message === 'string') {
          message = obj.message;
        } else if (typeof obj.message === 'object' && obj.message !== null) {
          const nested = obj.message as Record<string, unknown>;
          message = (nested.message as string) ?? message;
          code = (nested.code as string) ?? code;
          if (nested.details !== undefined) details = nested.details;
        }
        code = (obj.code as string) ?? this.codeFromStatus(status);
        if (obj.details !== undefined) details = obj.details;
        if (Array.isArray(obj.message)) {
          details = obj.message;
          message = 'Validation failed';
          code = 'VALIDATION_ERROR';
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.message, exception.stack);
    }

    const payload: ErrorBody = {
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      requestId,
    };

    response.status(status).json(payload);
  }

  private codeFromStatus(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
    };
    return map[status] ?? 'HTTP_ERROR';
  }
}
