import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), override: true });

import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './test-helper';

describe('OrdersModule Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;

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

    // Register User 1
    const u1 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'User One',
        email: 'user1@example.com',
        password: 'Password123!',
      });
    user1Token = u1.body.data.accessToken;
    user1Id = u1.body.data.user.id;

    // Register User 2
    const u2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'User Two',
        email: 'user2@example.com',
        password: 'Password123!',
      });
    user2Token = u2.body.data.accessToken;
    user2Id = u2.body.data.user.id;
  });

  describe('POST /api/orders', () => {
    it('10. should create a successful order and deduct product stock immediately', async () => {
      const product = await prisma.product.create({
        data: {
          name: 'Mechanical Gaming Keyboard',
          price: 150.0,
          stock_quantity: 10,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          items: [{ productId: product.id, quantity: 3 }],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(Number(res.body.data.total_amount)).toBe(450.0);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].quantity).toBe(3);
      expect(Number(res.body.data.items[0].unit_price)).toBe(150.0);

      // Verify stock in database is deducted from 10 to 7
      const updatedProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(updatedProduct?.stock_quantity).toBe(7);
    });

    it('11. should reject order with quantity greater than available stock with 409 Conflict', async () => {
      const product = await prisma.product.create({
        data: {
          name: 'Limited Edition Watch',
          price: 500.0,
          stock_quantity: 2,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          items: [{ productId: product.id, quantity: 5 }], // Request 5 when only 2 available
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(409);

      // Verify stock remains untouched at 2
      const updatedProduct = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(updatedProduct?.stock_quantity).toBe(2);

      // Verify NO order was created
      const orderCount = await prisma.order.count();
      expect(orderCount).toBe(0);
    });

    it('should handle duplicate products in the same order request by consolidating quantities', async () => {
      const product = await prisma.product.create({
        data: {
          name: 'Dual Request Item',
          price: 50.0,
          stock_quantity: 10,
        },
      });

      // User sends the same product ID twice (quantity 2 and quantity 3)
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          items: [
            { productId: product.id, quantity: 2 },
            { productId: product.id, quantity: 3 },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.total_amount)).toBe(250.0);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].quantity).toBe(5);

      // Verify stock deducted by 5
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.stock_quantity).toBe(5);
    });

    it('should process multi-product orders atomically without deadlocks', async () => {
      const p1 = await prisma.product.create({
        data: { name: 'Item Alpha', price: 100.0, stock_quantity: 10 },
      });
      const p2 = await prisma.product.create({
        data: { name: 'Item Beta', price: 200.0, stock_quantity: 10 },
      });

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          items: [
            { productId: p2.id, quantity: 1 },
            { productId: p1.id, quantity: 2 },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(Number(res.body.total_amount || res.body.data.total_amount)).toBe(400.0);

      const updatedP1 = await prisma.product.findUnique({ where: { id: p1.id } });
      const updatedP2 = await prisma.product.findUnique({ where: { id: p2.id } });
      expect(updatedP1?.stock_quantity).toBe(8);
      expect(updatedP2?.stock_quantity).toBe(9);
    });
  });

  describe('PATCH /api/orders/:id/cancel', () => {
    it('13 & 14. should cancel order successfully and restore stock to the product', async () => {
      const product = await prisma.product.create({
        data: {
          name: 'Wireless Earbuds',
          price: 99.0,
          stock_quantity: 10,
        },
      });

      // Place order for 4 items -> stock becomes 6
      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          items: [{ productId: product.id, quantity: 4 }],
        })
        .expect(201);

      const orderId = orderRes.body.data.id;

      let p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.stock_quantity).toBe(6);

      // Cancel order
      const cancelRes = await request(app.getHttpServer())
        .patch(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.data.status).toBe('CANCELLED');
      expect(cancelRes.body.data.cancelled_at).toBeDefined();

      // Verify stock is replenished back to 10
      p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.stock_quantity).toBe(10);
    });

    it('15. should prevent duplicate cancellation from replenishing stock twice', async () => {
      const product = await prisma.product.create({
        data: {
          name: 'Noise Cancelling Headphones',
          price: 200.0,
          stock_quantity: 10,
        },
      });

      // Buy 3 items -> stock 7
      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          items: [{ productId: product.id, quantity: 3 }],
        })
        .expect(201);

      const orderId = orderRes.body.data.id;

      // 1st Cancellation -> Success, stock restored to 10
      await request(app.getHttpServer())
        .patch(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      let p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.stock_quantity).toBe(10);

      // 2nd Cancellation attempt -> Should fail with 400 Bad Request
      const secondCancelRes = await request(app.getHttpServer())
        .patch(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(400);

      expect(secondCancelRes.body.success).toBe(false);

      // Crucial assertion: Stock must STILL be 10, NOT 13!
      p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.stock_quantity).toBe(10);
    });

    it('16. should prevent User 2 from cancelling or accessing User 1 orders', async () => {
      const product = await prisma.product.create({
        data: {
          name: 'Smart Speaker',
          price: 80.0,
          stock_quantity: 10,
        },
      });

      // User 1 creates order
      const orderRes = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          items: [{ productId: product.id, quantity: 2 }],
        })
        .expect(201);

      const orderId = orderRes.body.data.id;

      // User 2 attempts to cancel User 1's order -> 403 Forbidden
      const unauthorizedCancel = await request(app.getHttpServer())
        .patch(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);

      expect(unauthorizedCancel.body.success).toBe(false);

      // User 2 attempts to view User 1's order -> 404 Not Found (concealed)
      const unauthorizedGet = await request(app.getHttpServer())
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(404);

      expect(unauthorizedGet.body.success).toBe(false);

      // Stock must remain 8
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.stock_quantity).toBe(8);
    });
  });

  describe('GET /api/orders (Pagination & Isolation)', () => {
    it('17. should paginate orders for current user and isolate from other users', async () => {
      const product = await prisma.product.create({
        data: {
          name: 'Universal USB-C Cable',
          price: 15.0,
          stock_quantity: 100,
        },
      });

      // User 1 creates 7 orders
      for (let i = 0; i < 7; i++) {
        await request(app.getHttpServer())
          .post('/api/orders')
          .set('Authorization', `Bearer ${user1Token}`)
          .send({ items: [{ productId: product.id, quantity: 1 }] });
      }

      // User 2 creates 3 orders
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/api/orders')
          .set('Authorization', `Bearer ${user2Token}`)
          .send({ items: [{ productId: product.id, quantity: 1 }] });
      }

      // Query User 1 orders: page 1, limit 4
      const u1Res = await request(app.getHttpServer())
        .get('/api/orders?page=1&limit=4')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(u1Res.body.data.items.length).toBe(4);
      expect(u1Res.body.data.meta.total).toBe(7);
      expect(u1Res.body.data.meta.totalPages).toBe(2);
      expect(u1Res.body.data.meta.hasNextPage).toBe(true);

      for (const ord of u1Res.body.data.items) {
        expect(ord.user_id).toBe(user1Id);
      }

      // Query User 2 orders
      const u2Res = await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200);

      expect(u2Res.body.data.items.length).toBe(3);
      expect(u2Res.body.data.meta.total).toBe(3);

      for (const ord of u2Res.body.data.items) {
        expect(ord.user_id).toBe(user2Id);
      }
    }, 60000);
  });
});
