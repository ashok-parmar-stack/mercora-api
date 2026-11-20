import {
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateSubDistrictDto {
  @ApiProperty({ description: 'Name of the subDistrict/province', example: 'Gujarat' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ description: 'Local name', example: 'ગુજરાત' })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  localName?: string;

  @ApiProperty({ description: 'Unique Code (e.g. GJ or LGD code)', example: 'GJ' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: 'UUID of the district', example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  districtId: string;

  @ApiPropertyOptional({ description: 'Type (e.g. SUB_DISTRICT, UNION_TERRITORY)', default: 'SUB_DISTRICT' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  type?: string;

  @ApiPropertyOptional({ description: 'Census code if applicable' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  censusCode?: string;

  @ApiPropertyOptional({ description: 'Status UUID or CODE (ACTIVE/INACTIVE)' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Source system', default: 'SYSTEM' })
  @IsString()
  @IsOptional()
  source?: string;
}

export class UpdateSubDistrictDto extends PartialType(CreateSubDistrictDto) {}

export class SubDistrictQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  districtId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sort_by?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sort_order?: 'ASC' | 'DESC';
}

export class UpdateSubDistrictStatusDto {
  @ApiProperty({ description: 'Status ID or Code (ACTIVE/INACTIVE)' })
  @IsString()
  @IsNotEmpty()
  status: string;
}
