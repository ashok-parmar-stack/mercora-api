import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum HsnLevelEnum {
  CHAPTER_2 = 'CHAPTER_2',
  HEADING_4 = 'HEADING_4',
  SUBHEADING_6 = 'SUBHEADING_6',
  TARIFF_8 = 'TARIFF_8',
}

export class CreateHsnCodeDto {
  @ApiProperty({ description: 'Official HSN / ITCHS Code (2, 4, 6, or 8 digits)', example: '69072100' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ApiProperty({ description: 'Official Name / Commodity Description', example: 'Of a water absorption coefficient by weight not exceeding 0.5%' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Extended statutory description / notes' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'UUID of parent HSN code node', example: 'uuid' })
  @IsUUID()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ enum: HsnLevelEnum, default: HsnLevelEnum.TARIFF_8 })
  @IsEnum(HsnLevelEnum)
  @IsOptional()
  level?: HsnLevelEnum;

  @ApiPropertyOptional({ description: 'Standard Unit Quantity Code (UQC)', example: 'SQM' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({ description: 'Status UUID or Code', example: 'ACTIVE' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Source directory', example: 'ICEGATE' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sourceCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sourceRecordId?: string;
}

export class UpdateHsnCodeDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ enum: HsnLevelEnum })
  @IsEnum(HsnLevelEnum)
  @IsOptional()
  level?: HsnLevelEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;
}

export class HsnCodeQueryDto {
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

  @ApiPropertyOptional({ description: 'Search term for code or description' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: HsnLevelEnum, description: 'Filter by hierarchy level' })
  @IsString()
  @IsOptional()
  level?: string;

  @ApiPropertyOptional({ description: 'Filter by parent UUID' })
  @IsUUID()
  @IsOptional()
  parent_id?: string;

  @ApiPropertyOptional({ description: 'Filter by status (ACTIVE / INACTIVE)' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by data source' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({ description: 'Filter leaf nodes only' })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  is_leaf?: boolean;

  @ApiPropertyOptional({ default: 'code' })
  @IsString()
  @IsOptional()
  sort_by?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsString()
  @IsOptional()
  sort_order?: 'ASC' | 'DESC';
}

export class TriggerSyncDto {
  @ApiPropertyOptional({ description: 'Source adapter to run', example: 'ICEGATE', default: 'ICEGATE' })
  @IsString()
  @IsOptional()
  source?: string = 'ICEGATE';

  @ApiPropertyOptional({ description: 'Master taxonomy type', example: 'HSN', default: 'HSN' })
  @IsString()
  @IsOptional()
  masterType?: string = 'HSN';
}
