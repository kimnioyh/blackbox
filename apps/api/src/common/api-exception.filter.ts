import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = error instanceof HttpException ? error.getResponse() : null;
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? (body as { message: unknown }).message : error instanceof Error ? error.message : 'Internal server error';
    const code = typeof body === 'object' && body !== null && 'code' in body
      ? String((body as { code: unknown }).code) : status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR';
    response.status(status).json({ code, message: status === 500 ? 'Internal server error' : message, details: null });
  }
}
