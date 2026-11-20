import { IsUUID, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MapHsnCategoryDto {
  @ApiProperty({ description: 'Product Category UUID', example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  productCategoryId: string;

  @ApiPropertyOptional({ description: 'Mark as Primary Mercora category for this HSN', default: false })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean = false;
}

export class BatchMapHsnCategoryDto {
  @ApiProperty({ description: 'Array of Category UUIDs' })
  @IsUUID('4', { each: true })
  categoryIds: string[];

  @ApiPropertyOptional({ description: 'Primary Category UUID among the list' })
  @IsUUID()
  @IsOptional()
  primaryCategoryId?: string;
}
