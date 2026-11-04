import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

function validateMandatoryEnvironment() {
  const logger = new Logger('EnvironmentValidator');
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter((key) => !process.env[key] || process.env[key]?.trim() === '');
  if (missing.length > 0) {
    logger.error(`FATAL: Mandatory environment variable(s) missing: ${missing.join(', ')}`);
    logger.error('Application bootstrap aborted to prevent unsafe state execution.');
    process.exit(1);
  }
}

async function bootstrap() {
  validateMandatoryEnvironment();

  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enable graceful shutdown hooks for PostgreSQL connection pool drain
  app.enableShutdownHooks();

  // HTTP Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Ensures Swagger UI loads assets without CSP restriction
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Request Correlation ID Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.headers['x-request-id'] as string) || randomUUID();
    req.headers['x-request-id'] = correlationId;
    res.setHeader('x-request-id', correlationId);
    next();
  });

  // Global API Prefix
  app.setGlobalPrefix('api');

  // Dynamic CORS configuration
  const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : '*';
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global Input Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // OpenAPI / Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('E-Commerce High-Concurrency Backend API')
    .setDescription(
      'Enterprise E-Commerce API featuring PostgreSQL ACID transactions, atomic conditional inventory deduction, and zero race conditions under concurrent load.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter your JWT token (e.g. Bearer eyJhbGciOi...)',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  const appUrl = process.env.APP_URL || `http://localhost:${port}`;
  logger.log(`🚀 Production API is running at: ${appUrl}/api`);
  logger.log(`📖 Interactive Swagger Documentation: ${appUrl}/docs`);
  logger.log(`🩺 Health & Readiness Check Endpoint: ${appUrl}/api/health`);
}

bootstrap();
