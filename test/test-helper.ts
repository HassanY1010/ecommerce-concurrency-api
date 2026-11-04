import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ecommerce_test_db?schema=public';

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
