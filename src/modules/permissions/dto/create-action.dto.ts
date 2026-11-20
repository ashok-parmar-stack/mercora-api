import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MSG } from '../../../common/messages';

export class CreatePermissionActionDto {
  @ApiProperty({ description: 'Action display name', example: 'Export Trade Data' })
  @IsString({ message: MSG.VALIDATION.STRING('Action Name') })
  @MaxLength(100, { message: MSG.VALIDATION.MAX_LENGTH('Action Name', 100) })
  name: string;

  @ApiProperty({ description: 'Action code (e.g. VIEW, CREATE, UPDATE, DELETE, EXPORT)', example: 'EXPORT' })
  @IsString({ message: MSG.VALIDATION.STRING('Action Code') })
  @MaxLength(50, { message: MSG.VALIDATION.MAX_LENGTH('Action Code', 50) })
  code: string;

  @ApiPropertyOptional({ description: 'Action description', example: 'Allows exporting market records' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Description') })
  description?: string;

  @ApiPropertyOptional({ description: 'Status UUID', example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Status ID') })
  statusId?: string;
}
