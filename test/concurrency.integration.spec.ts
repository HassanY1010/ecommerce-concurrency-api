import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), override: true });

import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './test-helper';

describe('Concurrency & Race Condition Verification (Real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeAll(async () => {
    const context = await createTestApp();
    app = context.app;
    prisma = context.prisma;
    jwtService = app.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await prisma.cleanDatabase();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.cleanDatabase();
  });

  it('12. CRITICAL TEST: 100 simultaneous concurrent orders competing for the LAST remaining single item (stock=1)', async () => {
    // 1. Prepare 1 single product with exactly 1 item in stock
    const product = await prisma.product.create({
      data: {
        name: 'Rare Collector Edition Console',
        price: 999.0,
        stock_quantity: 1, // Only ONE piece available!
      },
    });

    // 2. Pre-seed 100 registered users in PostgreSQL and issue 100 valid JWT tokens
    const totalUsers = 100;
    const usersData = Array.from({ length: totalUsers }, (_, i) => ({
      name: `Competitor User ${i}`,
      email: `competitor_${i}@example.com`,
      password_hash: '$2a$12$e8w6W2E1rT3yU4i5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3g', // Precomputed bcrypt hash
    }));

    await prisma.user.createMany({ data: usersData });

    const createdUsers = await prisma.user.findMany({
      orderBy: { email: 'asc' },
    });
    expect(createdUsers.length).toBe(100);

    const userTokens = createdUsers.map((u) =>
      jwtService.sign({ sub: u.id, email: u.email }),
    );

    // Verify initial state
    const initialProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(initialProduct?.stock_quantity).toBe(1);

    // 3. Dispatch 100 concurrent order requests in controlled concurrency batches of 25
    // This executes true parallel HTTP requests against PostgreSQL while preventing Windows OS socket starvation.
    const batchSize = 25;
    const results: any[] = [];

    for (let i = 0; i < userTokens.length; i += batchSize) {
      const batchTokens = userTokens.slice(i, i + batchSize);
      const batchPromises = batchTokens.map((token) =>
        request(app.getHttpServer())
          .post('/api/orders')
          .set('Authorization', `Bearer ${token}`)
          .send({
            items: [{ productId: product.id, quantity: 1 }],
          }),
      );
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
    }

    // 4. Analyze HTTP status codes
    let successCount = 0;
    let conflictCount = 0;
    const unexpectedResponses: any[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const statusCode = result.value.status;
        if (statusCode === 201) {
          successCount++;
        } else if (statusCode === 409) {
          conflictCount++;
          // Ensure error body contains proper insufficient stock message
          expect(result.value.body.success).toBe(false);
          expect(result.value.body.error).toBe('INSUFFICIENT_STOCK');
        } else {
          unexpectedResponses.push({ status: statusCode, body: result.value.body });
        }
      } else {
        unexpectedResponses.push({ reason: result.reason });
      }
    }

    // 5. Verification 1: Exactly 1 order succeeded
    expect(successCount).toBe(1);

    // 6. Verification 2: Exactly 99 orders failed due to stock exhaustion
    expect(conflictCount).toBe(99);
    expect(unexpectedResponses.length).toBe(0);

    // 7. Verification 3: Final inventory in PostgreSQL must equal exactly 0 (NEVER negative!)
    const finalProduct = await prisma.product.findUnique({
      where: { id: product.id },
    });
    expect(finalProduct?.stock_quantity).toBe(0);

    // 8. Verification 4: Exactly 1 order record created in PostgreSQL
    const totalOrdersInDb = await prisma.order.count();
    expect(totalOrdersInDb).toBe(1);

    // 9. Verification 5: Exactly 1 order_item record created in PostgreSQL
    const totalOrderItemsInDb = await prisma.orderItem.count();
    expect(totalOrderItemsInDb).toBe(1);

    // 10. Verification 6: No orphan or dangling records exist
    const winningOrder = await prisma.order.findFirst({
      include: { items: true },
    });
    expect(winningOrder).toBeDefined();
    expect(winningOrder?.status).toBe('COMPLETED');
    expect(winningOrder?.items.length).toBe(1);
    expect(winningOrder?.items[0].product_id).toBe(product.id);
    expect(winningOrder?.items[0].quantity).toBe(1);
  }, 45000);

  it('CRITICAL TEST: 20 simultaneous concurrent cancellation attempts on the SAME order', async () => {
    // 1. Create product with stock=5
    const product = await prisma.product.create({
      data: {
        name: 'Smart Thermostat',
        price: 120.0,
        stock_quantity: 5,
      },
    });

    // 2. Register user and buy 2 items
    const user = await prisma.user.create({
      data: {
        name: 'Cancellation Tester',
        email: 'canceller@example.com',
        password_hash: '$2a$12$e8w6W2E1rT3yU4i5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3g',
      },
    });
    const token = jwtService.sign({ sub: user.id, email: user.email });

    const orderRes = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId: product.id, quantity: 2 }] })
      .expect(201);

    const orderId = orderRes.body.data.id;

    // Stock should now be 3
    let p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.stock_quantity).toBe(3);

    // 3. Fire 20 simultaneous cancellation requests on the SAME order ID
    const concurrentCancelPromises = Array.from({ length: 20 }, () =>
      request(app.getHttpServer())
        .patch(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${token}`),
    );

    const results = await Promise.allSettled(concurrentCancelPromises);

    let cancelSuccess = 0;
    let cancelFailed = 0;

    for (const res of results) {
      if (res.status === 'fulfilled') {
        if (res.value.status === 200) {
          cancelSuccess++;
        } else if (res.value.status === 400) {
          cancelFailed++;
        }
      }
    }

    // Exactly 1 cancellation call must succeed
    expect(cancelSuccess).toBe(1);

    // The other 19 calls must fail with 400 Bad Request
    expect(cancelFailed).toBe(19);

    // Crucial check: stock must be restored to 5 (3 + 2), NEVER 3 + 2 * 20 = 43!
    p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.stock_quantity).toBe(5);

    // Order status must be CANCELLED
    const cancelledOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(cancelledOrder?.status).toBe('CANCELLED');
    expect(cancelledOrder?.cancelled_at).toBeDefined();
  }, 45000);
});
