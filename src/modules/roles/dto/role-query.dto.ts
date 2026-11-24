import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';

export class RoleQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-indexed)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Fuzzy search by role name, code, or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by Status ID or Status code (e.g. ACTIVE)' })
  @IsOptional()
  statusId?: string;

  @ApiPropertyOptional({ description: 'Include soft-deleted roles' })
  @IsOptional()
  includeDeleted?: boolean | string;

  @ApiPropertyOptional({ description: 'Sort column name', default: 'name' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort column name (snake_case alias)', default: 'name' })
  @IsOptional()
  @IsString()
  sort_by?: string;

  @ApiPropertyOptional({ description: 'Sort order ASC or DESC', default: 'ASC', enum: ['ASC', 'DESC', 'asc', 'desc'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortOrder?: 'ASC' | 'DESC' | 'asc' | 'desc';

  @ApiPropertyOptional({ description: 'Sort order ASC or DESC (snake_case alias)', default: 'ASC', enum: ['ASC', 'DESC', 'asc', 'desc'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sort_order?: 'ASC' | 'DESC' | 'asc' | 'desc';
}
