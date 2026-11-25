import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UserQueryDto {
  @ApiPropertyOptional({ description: 'Filter by Role ID' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  roleId?: string;

  @ApiPropertyOptional({ description: 'Filter by Status ID or Code' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  statusId?: string;

  @ApiPropertyOptional({ description: 'Include soft-deleted users' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({ description: 'Search name, email, or slug' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
