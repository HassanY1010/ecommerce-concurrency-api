import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class QueryProductDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search query to filter products by name (case-insensitive)' })
  @IsOptional()
  @IsString()
  search?: string;
}
