import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MSG } from '../../../common/messages';

export class CreateRoleDto {
  @ApiProperty({ description: 'Role display name', example: 'Operations Lead' })
  @IsString({ message: MSG.VALIDATION.STRING('Role Name') })
  @MaxLength(100, { message: MSG.VALIDATION.MAX_LENGTH('Role Name', 100) })
  name: string;

  @ApiProperty({ description: 'Unique uppercase role code', example: 'OPERATIONS_LEAD' })
  @IsString({ message: MSG.VALIDATION.STRING('Role Code') })
  @MaxLength(50, { message: MSG.VALIDATION.MAX_LENGTH('Role Code', 50) })
  code: string;

  @ApiPropertyOptional({ description: 'Description of role responsibilities', example: 'Manages operational catalog data' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Description') })
  description?: string;

  @ApiPropertyOptional({ description: 'Status UUID', example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Status ID') })
  statusId?: string;
}
