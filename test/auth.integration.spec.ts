import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './test-helper';

describe('AuthModule Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.cleanDatabase();
  });

  describe('POST /api/auth/register', () => {
    it('1. should register a new user successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Sarah Connor',
          email: 'sarah@example.com',
          password: 'SecurePassword123!',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe('sarah@example.com');
      expect(res.body.data.user.name).toBe('Sarah Connor');
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    it('2. should reject duplicate email registration with 409 Conflict', async () => {
      // First registration
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Sarah Connor',
          email: 'duplicate@example.com',
          password: 'Password123!',
        })
        .expect(201);

      // Duplicate registration attempt
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Another User',
          email: 'duplicate@example.com',
          password: 'DifferentPassword123!',
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(409);
    });

    it('3. should verify password is saved as a secure hash in PostgreSQL, not plain text', async () => {
      const plainPassword = 'PlainSecretPassword123!';

      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Security Test User',
          email: 'security@example.com',
          password: plainPassword,
        })
        .expect(201);

      const dbUser = await prisma.user.findUnique({
        where: { email: 'security@example.com' },
      });

      expect(dbUser).toBeDefined();
      expect(dbUser?.password_hash).not.toBe(plainPassword);
      // Verify bcrypt format $2a$ / $2b$ and 60 chars length
      expect(dbUser?.password_hash).toMatch(/^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Login User',
          email: 'login@example.com',
          password: 'ValidPassword123!',
        });
    });

    it('4. should login successfully with correct credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'ValidPassword123!',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe('login@example.com');
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    it('5. should reject login with incorrect password with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword!',
        })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(401);
    });
  });

  describe('Protected Routes (GET /api/auth/me)', () => {
    it('6. should reject access to protected routes without JWT token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(401);
    });

    it('should grant access to protected routes with valid JWT token', async () => {
      const regRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          name: 'Protected User',
          email: 'protected@example.com',
          password: 'Password123!',
        });

      const token = regRes.body.data.accessToken;

      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('protected@example.com');
    });
  });
});
