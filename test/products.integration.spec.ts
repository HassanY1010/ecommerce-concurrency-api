import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './test-helper';

describe('ProductsModule Integration Tests', () => {
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

    // Seed 15 diverse products
    await prisma.product.createMany({
      data: [
        { name: 'Apple iPhone 15 Pro', price: 999.99, stock_quantity: 20 },
        { name: 'Apple MacBook Pro 16', price: 2499.00, stock_quantity: 10 },
        { name: 'Apple iPad Air', price: 599.99, stock_quantity: 15 },
        { name: 'Samsung Galaxy S24 Ultra', price: 1199.99, stock_quantity: 25 },
        { name: 'Samsung 4K Smart TV', price: 799.50, stock_quantity: 8 },
        { name: 'Sony PlayStation 5', price: 499.99, stock_quantity: 12 },
        { name: 'Sony WH-1000XM5 Headphones', price: 349.99, stock_quantity: 30 },
        { name: 'Dell XPS 15 Laptop', price: 1899.00, stock_quantity: 7 },
        { name: 'Logitech MX Master 3S Mouse', price: 99.99, stock_quantity: 45 },
        { name: 'Keychron Q1 Pro Mechanical Keyboard', price: 199.00, stock_quantity: 18 },
        { name: 'LG UltraFine 27 Monitor', price: 699.99, stock_quantity: 14 },
        { name: 'Bose QuietComfort Ultra', price: 429.00, stock_quantity: 22 },
        { name: 'Google Pixel 8 Pro', price: 899.00, stock_quantity: 16 },
        { name: 'Asus ROG Zephyrus G14', price: 1599.99, stock_quantity: 5 },
        { name: 'Kindle Paperwhite', price: 139.99, stock_quantity: 40 },
      ],
    });
  });

  describe('GET /api/products', () => {
    it('7. should display products with pagination metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.items.length).toBe(10); // Default limit is 10
      expect(res.body.data.meta).toEqual({
        page: 1,
        limit: 10,
        total: 15,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
      });
    });

    it('8. should search products by name (case-insensitive search)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products?search=apple')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(3);
      for (const item of res.body.data.items) {
        expect(item.name.toLowerCase()).toContain('apple');
      }
    });

    it('9. should paginate products with custom page and limit', async () => {
      // Page 2 with limit 5
      const res = await request(app.getHttpServer())
        .get('/api/products?page=2&limit=5')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(5);
      expect(res.body.data.meta).toEqual({
        page: 2,
        limit: 5,
        total: 15,
        totalPages: 3,
        hasNextPage: true,
        hasPrevPage: true,
      });

      // Page 3 with limit 5 (last page)
      const lastPageRes = await request(app.getHttpServer())
        .get('/api/products?page=3&limit=5')
        .expect(200);

      expect(lastPageRes.body.data.items.length).toBe(5);
      expect(lastPageRes.body.data.meta.hasNextPage).toBe(false);
      expect(lastPageRes.body.data.meta.hasPrevPage).toBe(true);
    });
  });

  describe('GET /api/products/:id', () => {
    it('should return a single product by ID', async () => {
      const product = await prisma.product.findFirst();
      expect(product).toBeDefined();

      const res = await request(app.getHttpServer())
        .get(`/api/products/${product?.id}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(product?.id);
      expect(res.body.data.name).toBe(product?.name);
    });

    it('should return 404 if product does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app.getHttpServer())
        .get(`/api/products/${nonExistentId}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(404);
    });
  });
});
