import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';
import { PaginationQueryDto, PaginatedResult } from '../../common/dto/pagination-query.dto';
import {
  InsufficientStockException,
  OrderCannotBeCancelledException,
  OrderNotFoundException,
  ProductNotFoundException,
} from '../../common/exceptions/business.exceptions';
import { Prisma, OrderStatus } from '@prisma/client';

export interface PopulatedOrder {
  id: string;
  user_id: string;
  total_amount: Prisma.Decimal;
  status: OrderStatus;
  created_at: Date;
  updated_at: Date;
  cancelled_at: Date | null;
  items: Array<{
    id: string;
    order_id: string;
    product_id: string;
    quantity: number;
    unit_price: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    product?: {
      id: string;
      name: string;
    };
  }>;
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates an order with strict concurrency protection using PostgreSQL ACID transactions
   * and Atomic Conditional UPDATE to eliminate race conditions and double selling.
   */
  async createOrder(userId: string, createOrderDto: CreateOrderDto): Promise<PopulatedOrder> {
    const rawItems = this.normalizeItems(createOrderDto);

    if (rawItems.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }

    // Sort items by product ID to prevent deadlocks across concurrent multi-item transactions
    const items = [...rawItems].sort((a, b) => a.productId.localeCompare(b.productId));

    return this.prisma.$transaction(
      async (tx) => {
        let totalAmount = new Prisma.Decimal(0);
        const orderItemsData: Array<{
          product_id: string;
          quantity: number;
          unit_price: Prisma.Decimal;
          subtotal: Prisma.Decimal;
        }> = [];

        for (const item of items) {
          // Atomic Conditional Update:
          // Atomically decrements inventory ONLY if current stock >= requested quantity.
          // In PostgreSQL, this locks the specific product row. Subsequent transactions will
          // see the updated stock quantity and fail the WHERE condition if stock was exhausted.
          const updatedProducts: Array<{
            id: string;
            name: string;
            price: Prisma.Decimal;
            stock_quantity: number;
          }> = await tx.$queryRaw`
            UPDATE "products"
            SET "stock_quantity" = "stock_quantity" - ${item.quantity},
                "updated_at" = NOW()
            WHERE "id" = ${item.productId}
              AND "stock_quantity" >= ${item.quantity}
            RETURNING "id", "name", "price", "stock_quantity"
          `;

          if (updatedProducts.length === 0) {
            // Check if product exists to provide specific error
            const product = await tx.product.findUnique({
              where: { id: item.productId },
            });

            if (!product) {
              throw new ProductNotFoundException(item.productId);
            }

            throw new InsufficientStockException(
              `Insufficient stock for product "${product.name}". Requested: ${item.quantity}, Available: ${product.stock_quantity}`,
            );
          }

          const product = updatedProducts[0];
          const unitPrice = new Prisma.Decimal(product.price);
          const subtotal = unitPrice.mul(item.quantity);
          totalAmount = totalAmount.add(subtotal);

          orderItemsData.push({
            product_id: product.id,
            quantity: item.quantity,
            unit_price: unitPrice,
            subtotal,
          });
        }

        // Create the order with status COMPLETED and associated items
        const order = await tx.order.create({
          data: {
            user_id: userId,
            total_amount: totalAmount,
            status: OrderStatus.COMPLETED,
            items: {
              create: orderItemsData,
            },
          },
          include: {
            items: {
              include: {
                product: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        });

        return order as PopulatedOrder;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 30000, // Allow up to 30s queue wait for transaction slot under high concurrency bursts
        timeout: 30000,
      },
    );
  }

  /**
   * Cancels an order and replenishes stock atomically.
   * Utilizes atomic conditional status transition to prevent duplicate cancellations.
   */
  async cancelOrder(userId: string, orderId: string): Promise<PopulatedOrder> {
    return this.prisma.$transaction(
      async (tx) => {
        // Atomic status transition:
        // Updates status to CANCELLED only if current status is COMPLETED and belongs to user.
        // If two concurrent cancel requests are made, exactly ONE will update 1 row, and the second updates 0 rows.
        const updatedOrders: Array<{ id: string }> = await tx.$queryRaw`
          UPDATE "orders"
          SET "status" = 'CANCELLED'::"OrderStatus",
              "cancelled_at" = NOW(),
              "updated_at" = NOW()
          WHERE "id" = ${orderId}
            AND "user_id" = ${userId}
            AND "status" = 'COMPLETED'::"OrderStatus"
          RETURNING "id"
        `;

        if (updatedOrders.length === 0) {
          // Determine the specific reason for denial
          const existingOrder = await tx.order.findUnique({
            where: { id: orderId },
          });

          if (!existingOrder) {
            throw new OrderNotFoundException(orderId);
          }

          if (existingOrder.user_id !== userId) {
            throw new ForbiddenException('You do not have permission to cancel an order belonging to another customer');
          }

          if (existingOrder.status === OrderStatus.CANCELLED) {
            throw new OrderCannotBeCancelledException(
              `Order "${orderId}" has already been cancelled. Inventory cannot be refunded multiple times.`,
            );
          }

          throw new OrderCannotBeCancelledException(
            `Order "${orderId}" cannot be cancelled because its status is "${existingOrder.status}".`,
          );
        }

        // Fetch items associated with the cancelled order to replenish stock
        const orderItems = await tx.orderItem.findMany({
          where: { order_id: orderId },
        });

        // Sort items by product ID deterministically to prevent deadlocks across concurrent cancellations
        const sortedItems = [...orderItems].sort((a, b) => a.product_id.localeCompare(b.product_id));

        for (const item of sortedItems) {
          await tx.$queryRaw`
            UPDATE "products"
            SET "stock_quantity" = "stock_quantity" + ${item.quantity},
                "updated_at" = NOW()
            WHERE "id" = ${item.product_id}
          `;
        }

        // Return updated order
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            items: {
              include: {
                product: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        });

        return order as PopulatedOrder;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 20000,
        timeout: 20000,
      },
    );
  }

  /**
   * Retrieves paginated orders strictly for the authenticated user
   */
  async getUserOrders(userId: string, query: PaginationQueryDto): Promise<PaginatedResult<PopulatedOrder>> {
    const { page, limit, skip } = query;

    const where: Prisma.OrderWhereInput = {
      user_id: userId,
    };

    const [total, items] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items as PopulatedOrder[],
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Retrieves single order by ID, enforcing user ownership
   */
  async getOrderById(userId: string, orderId: string): Promise<PopulatedOrder> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new OrderNotFoundException(orderId);
    }

    if (order.user_id !== userId) {
      // Conceal existence of other users' orders for security
      throw new OrderNotFoundException(orderId);
    }

    return order as PopulatedOrder;
  }

  /**
   * Normalizes input payload: supports both { items: [...] } and shorthand { productId, quantity }
   * and consolidates duplicate product entries in the same request.
   */
  private normalizeItems(dto: CreateOrderDto): OrderItemDto[] {
    const rawList: OrderItemDto[] = [];

    if (dto.items && Array.isArray(dto.items) && dto.items.length > 0) {
      rawList.push(...dto.items);
    } else if (dto.productId && dto.quantity) {
      rawList.push({ productId: dto.productId, quantity: dto.quantity });
    }

    // Consolidate identical products
    const consolidated = new Map<string, number>();
    for (const item of rawList) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        throw new BadRequestException('Each item must contain a valid productId and positive quantity');
      }
      const existing = consolidated.get(item.productId) || 0;
      consolidated.set(item.productId, existing + item.quantity);
    }

    return Array.from(consolidated.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
  }
}
