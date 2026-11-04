import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        message = (res as any).message || exception.message;
        error = (res as any).error || exception.name;
      } else {
        message = res;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.error(`Prisma Known Error [${exception.code}]: ${exception.message}`);
      // Prisma error code handling
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const target = (exception.meta?.target as string[]) || [];
          error = 'UNIQUE_CONSTRAINT_VIOLATION';
          message = `A record with this ${target.join(', ')} already exists.`;
          break;
        }
        case 'P2025': {
          status = HttpStatus.NOT_FOUND;
          error = 'RECORD_NOT_FOUND';
          message = 'The requested database record was not found.';
          break;
        }
        case 'P2003': {
          status = HttpStatus.BAD_REQUEST;
          error = 'FOREIGN_KEY_VIOLATION';
          message = 'Foreign key constraint failed on the referenced record.';
          break;
        }
        default: {
          status = HttpStatus.BAD_REQUEST;
          error = 'DATABASE_ERROR';
          message = 'A database operation error occurred.';
          break;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unexpected Exception: ${exception.message}`, exception.stack);
    }

    // Never leak stack trace to the client in production or dev responses
    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
