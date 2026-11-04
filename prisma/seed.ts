import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();

  // Create demo users
  const hashedPassword = await bcrypt.hash('Password123!', 12);

  const demoUser = await prisma.user.create({
    data: {
      name: 'Ahmed Developer',
      email: 'ahmed@example.com',
      password_hash: hashedPassword,
    },
  });

  const secondaryUser = await prisma.user.create({
    data: {
      name: 'Sara Engineer',
      email: 'sara@example.com',
      password_hash: hashedPassword,
    },
  });

  console.log(`👤 Created Demo Users: ${demoUser.email}, ${secondaryUser.email}`);

  // Create sample catalog
  const products = await prisma.product.createMany({
    data: [
      { name: 'Apple iPhone 15 Pro Max', price: 1199.99, stock_quantity: 50 },
      { name: 'Apple MacBook Pro 16 M3 Max', price: 3499.0, stock_quantity: 15 },
      { name: 'Sony PlayStation 5 Digital Edition', price: 449.99, stock_quantity: 25 },
      { name: 'Sony WH-1000XM5 Wireless Headphones', price: 399.99, stock_quantity: 40 },
      { name: 'Dell UltraSharp 32 4K Monitor', price: 899.5, stock_quantity: 12 },
      { name: 'Keychron Q1 Pro Wireless Keyboard', price: 199.0, stock_quantity: 30 },
      { name: 'Logitech MX Master 3S Mouse', price: 99.99, stock_quantity: 100 },
      { name: 'Samsung Galaxy S24 Ultra', price: 1299.99, stock_quantity: 35 },
      { name: 'LG C3 55-inch OLED 4K Smart TV', price: 1499.0, stock_quantity: 8 },
      { name: 'Kindle Oasis E-Reader', price: 249.99, stock_quantity: 20 },
      { name: 'Limited Edition Cyberpunk Collectible (Last Item)', price: 999.0, stock_quantity: 1 },
    ],
  });

  console.log(`📦 Seeded products catalog.`);
  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
