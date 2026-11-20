import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MSG } from '../../../common/messages';

export class UpdatePermissionDto {
  @ApiPropertyOptional({ description: 'Permission module display name', example: 'Trade & Market Analytics' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Permission Name') })
  @MaxLength(100, { message: MSG.VALIDATION.MAX_LENGTH('Permission Name', 100) })
  name?: string;

  @ApiPropertyOptional({ description: 'Description of module purpose', example: 'Updated trade details' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Description') })
  description?: string;

  @ApiPropertyOptional({ description: 'Status UUID', example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Status ID') })
  statusId?: string;
}
