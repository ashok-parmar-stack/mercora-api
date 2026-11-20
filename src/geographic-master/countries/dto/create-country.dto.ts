import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  Length,
  Matches,
  IsUUID,
} from 'class-validator';

export class CreateCountryDto {
  @ApiProperty({
    description: 'Common Country Name',
    example: 'India',
  })
  @IsNotEmpty({ message: 'Country name is required' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Official State Name',
    example: 'Republic of India',
  })
  @IsOptional()
  @IsString()
  officialName?: string;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-2 two-letter code',
    example: 'IN',
  })
  @IsNotEmpty({ message: 'ISO2 code is required' })
  @IsString()
  @Length(2, 2, { message: 'ISO2 code must be exactly 2 characters' })
  @Matches(/^[A-Z]{2}$/i, { message: 'ISO2 code must consist of 2 alphabetic characters' })
  iso2Code: string;

  @ApiProperty({
    description: 'ISO 3166-1 alpha-3 three-letter code',
    example: 'IND',
  })
  @IsNotEmpty({ message: 'ISO3 code is required' })
  @IsString()
  @Length(3, 3, { message: 'ISO3 code must be exactly 3 characters' })
  @Matches(/^[A-Z]{3}$/i, { message: 'ISO3 code must consist of 3 alphabetic characters' })
  iso3Code: string;

  @ApiPropertyOptional({
    description: 'ISO 3166-1 numeric three-digit code',
    example: '356',
  })
  @IsOptional()
  @IsString()
  numericCode?: string;

  @ApiPropertyOptional({
    description: 'International dialing code prefix',
    example: '+91',
  })
  @IsOptional()
  @IsString()
  phoneCode?: string;

  @ApiPropertyOptional({
    description: 'Default 3-letter currency code',
    example: 'INR',
  })
  @IsOptional()
  @IsString()
  currencyCode?: string;

  @ApiPropertyOptional({
    description: 'Status code (e.g. ACTIVE, INACTIVE)',
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'UUID of associated Status record',
  })
  @IsOptional()
  @IsUUID('4', { message: 'statusId must be a valid UUID' })
  statusId?: string;

  @ApiPropertyOptional({
    description: 'Data source origin (LGD, ISO, MANUAL)',
    example: 'MANUAL',
    default: 'MANUAL',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    description: 'Identifier within the external source system',
    example: 'LGD-IN',
  })
  @IsOptional()
  @IsString()
  sourceCode?: string;
}
