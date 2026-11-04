import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    super({
      datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Helper utility to clean all database tables (useful for isolated integration and concurrency tests)
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('cleanDatabase is strictly prohibited in production environment!');
    }
    await this.$transaction([
      this.orderItem.deleteMany(),
      this.order.deleteMany(),
      this.product.deleteMany(),
      this.user.deleteMany(),
    ]);
  }
}
