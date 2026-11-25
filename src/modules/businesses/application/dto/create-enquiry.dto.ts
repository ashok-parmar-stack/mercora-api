import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBusinessEnquiryDto {
  @ApiProperty({ example: 'biz-17900001-ab12', description: 'Target directory business ID or slug' })
  @IsString()
  @IsNotEmpty({ message: 'businessId is required' })
  @MaxLength(64)
  businessId: string;

  @ApiPropertyOptional({ example: 'Apex Precision Works' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessName?: string;

  @ApiProperty({ example: 'Rohan Mehta' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 'rohan@company.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(255)
  email?: string;

  @ApiProperty({ example: '+91 98765 43210' })
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @MinLength(6)
  @MaxLength(50)
  phone: string;

  @ApiPropertyOptional({ example: 'Mehta Global Trading LLP' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string;

  @ApiProperty({ example: 'Requesting quotation for 500 units FOB Mundra.' })
  @IsString()
  @IsNotEmpty({ message: 'Inquiry message is required' })
  @MinLength(5)
  @MaxLength(3000)
  message: string;

  @ApiPropertyOptional({ example: 'DIRECTORY_RFQ' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;
}
