import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @ApiProperty({ description: 'Product ID (UUID)', example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'Quantity to purchase (must be > 0)', example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity: number;
}

export class CreateOrderDto {
  @ApiPropertyOptional({
    description: 'Array of items to purchase. If omitted, single productId & quantity can be passed directly.',
    type: [OrderItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  // Convenience shorthand fields for single-product orders
  @ApiPropertyOptional({ description: 'Product ID (for quick single item order)' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'Quantity (for quick single item order)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity?: number;
}
