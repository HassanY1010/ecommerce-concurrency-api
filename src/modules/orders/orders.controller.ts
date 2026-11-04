import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserWithoutPassword } from '../users/users.service';

@ApiTags('Orders')
@ApiBearerAuth('JWT-auth')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order with atomic inventory deduction' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 409, description: 'Insufficient product inventory (out of stock)' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(userId, createOrderDto);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve paginated orders for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Paginated user order history' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.ordersService.getUserOrders(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve order details by ID for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Order details' })
  @ApiResponse({ status: 404, description: 'Order not found or unauthorized' })
  async findById(
    @CurrentUser('id') userId: string,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.getOrderById(userId, orderId);
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an order and atomically restore stock' })
  @ApiResponse({ status: 200, description: 'Order successfully cancelled and stock restored' })
  @ApiResponse({ status: 400, description: 'Order cannot be cancelled (e.g. already cancelled)' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 403, description: 'Forbidden (belongs to another user)' })
  async cancel(
    @CurrentUser('id') userId: string,
    @Param('id') orderId: string,
  ) {
    return this.ordersService.cancelOrder(userId, orderId);
  }
}
