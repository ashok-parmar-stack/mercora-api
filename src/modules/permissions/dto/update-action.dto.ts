import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MSG } from '../../../common/messages';

export class UpdatePermissionActionDto {
  @ApiPropertyOptional({ description: 'Action display name', example: 'Export Datasets' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Action Name') })
  @MaxLength(100, { message: MSG.VALIDATION.MAX_LENGTH('Action Name', 100) })
  name?: string;

  @ApiPropertyOptional({ description: 'Action description', example: 'Allows exporting datasets' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Description') })
  description?: string;

  @ApiPropertyOptional({ description: 'Status UUID', example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Status ID') })
  statusId?: string;
}
