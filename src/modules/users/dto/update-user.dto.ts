import { IsString, IsOptional, IsUUID, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MSG } from '../../../common/messages';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Full name of the user', example: 'John Doe Updated' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Name') })
  name?: string;

  @ApiPropertyOptional({ description: 'Updated URL-safe slug', example: 'john-doe-updated' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Slug') })
  @Matches(/^[a-z0-9-]+$/, { message: MSG.VALIDATION.INVALID_SLUG })
  slug?: string;

  @ApiPropertyOptional({ description: 'Contact phone number', example: '+1 555-0188' })
  @IsOptional()
  @IsString({ message: MSG.VALIDATION.STRING('Phone') })
  phone?: string;

  @ApiPropertyOptional({ description: 'Target Role UUID', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsOptional()
  @IsUUID('4', { message: MSG.VALIDATION.INVALID_UUID('Role ID') })
  roleId?: string;

  @ApiPropertyOptional({ description: 'Target Status UUID', example: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  @IsOptional()
  @IsUUID('4', { message: MSG.VALIDATION.INVALID_UUID('Status ID') })
  statusId?: string;

  @ApiPropertyOptional({ description: 'Affiliated Company UUID', example: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  @IsOptional()
  @IsUUID('4', { message: MSG.VALIDATION.INVALID_UUID('Company ID') })
  companyId?: string;
}
