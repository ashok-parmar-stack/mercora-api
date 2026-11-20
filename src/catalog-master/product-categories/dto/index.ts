import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsNumber,
  ValidateIf,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductCategoryDto {
  @ApiProperty({ description: 'Category Name', example: 'Porcelain Floor Tiles' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ description: 'Unique Category Code', example: 'PORCELAIN-FLOOR-TILES' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  code?: string;

  @ApiPropertyOptional({ description: 'URL Slug', example: 'porcelain-floor-tiles' })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  slug?: string;

  @ApiPropertyOptional({ description: 'Parent Category UUID (null for root)', example: 'uuid' })
  @ValidateIf((o) => !!o.parentId)
  @IsUUID()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Category Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Lucide icon identifier', example: 'Layers' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  icon?: string;

  @ApiPropertyOptional({ description: 'Image banner URL' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Display sort order', example: 10, default: 0 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Protected system core category', default: false })
  @IsBoolean()
  @IsOptional()
  isSystem?: boolean;

  @ApiPropertyOptional({ description: 'Status UUID or Code (ACTIVE/INACTIVE)' })
  @IsString()
  @IsOptional()
  status?: string;
}

export class UpdateProductCategoryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;
}

export class MoveCategoryDto {
  @ApiPropertyOptional({ description: 'New Parent UUID or null for Root level', example: 'uuid' })
  @IsUUID()
  @IsOptional()
  targetParentId: string | null;
}

export class CategoryQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size', default: 50 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Search term for name, code, or description' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by parent category UUID' })
  @IsUUID()
  @IsOptional()
  parent_id?: string;

  @ApiPropertyOptional({ description: 'Filter by specific level depth (1, 2, 3...)' })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  level?: number;

  @ApiPropertyOptional({ description: 'Filter root categories only (level 1)' })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  roots_only?: boolean;

  @ApiPropertyOptional({ description: 'Filter by status (ACTIVE / INACTIVE)' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ default: 'sortOrder' })
  @IsString()
  @IsOptional()
  sort_by?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsString()
  @IsOptional()
  sort_order?: 'ASC' | 'DESC';
}
