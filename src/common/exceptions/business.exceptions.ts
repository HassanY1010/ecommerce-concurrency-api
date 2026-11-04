import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientStockException extends HttpException {
  constructor(message = 'Insufficient stock available for the requested product(s)') {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'INSUFFICIENT_STOCK',
        message,
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class OrderCannotBeCancelledException extends HttpException {
  constructor(message = 'The order cannot be cancelled in its current state') {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'ORDER_CANNOT_BE_CANCELLED',
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class OrderNotFoundException extends HttpException {
  constructor(orderId: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'ORDER_NOT_FOUND',
        message: `Order with ID "${orderId}" was not found`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ProductNotFoundException extends HttpException {
  constructor(productId: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID "${productId}" was not found`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
