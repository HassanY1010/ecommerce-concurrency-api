import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { QueryProductDto } from './dto/query-product.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginatedResult } from '../../common/dto/pagination-query.dto';
import { ProductNotFoundException } from '../../common/exceptions/business.exceptions';
import { Prisma, Product } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    return this.prisma.product.create({
      data: {
        name: createProductDto.name.trim(),
        price: new Prisma.Decimal(createProductDto.price),
        stock_quantity: createProductDto.stock_quantity,
      },
    });
  }

  async findAll(query: QueryProductDto): Promise<PaginatedResult<Product>> {
    const { page, limit, skip, search } = query;

    const where: Prisma.ProductWhereInput = {};

    if (search && search.trim().length > 0) {
      where.name = {
        contains: search.trim(),
        mode: 'insensitive',
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
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

  async findById(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new ProductNotFoundException(id);
    }

    return product;
  }
}
