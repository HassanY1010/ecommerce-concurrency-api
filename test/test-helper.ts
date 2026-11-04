import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  // Explicitly force test environment variables with override
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), override: true });
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/ecommerce_test_db?schema=public&connection_limit=50&pool_timeout=30';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-1234567890!';
  process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
  process.env.THROTTLE_TTL = '60000';
  process.env.THROTTLE_LIMIT = '10000';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();

  const prisma = app.get<PrismaService>(PrismaService);
  await prisma.cleanDatabase();

  return { app, prisma };
}
