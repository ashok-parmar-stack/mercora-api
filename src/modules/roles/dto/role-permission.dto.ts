import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MSG } from '../../../common/messages';

/** Matrix: { permissionActionId: boolean }[] — one entry per cell */
export class UpdateRolePermissionMatrixDto {
  @ApiProperty({
    description: 'Array of Permission Action UUIDs to assign to this role (replaces all existing)',
    type: [String],
    example: ['d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'],
  })
  @IsArray({ message: MSG.VALIDATION.ARRAY('Permission Action IDs') })
  @IsUUID('4', {
    each: true,
    message: MSG.VALIDATION.INVALID_UUID('Each Permission Action ID'),
  })
  permissionActionIds: string[];
}

export class AddRolePermissionsDto {
  @ApiProperty({
    description: 'Array of Permission Action UUIDs to add to this role',
    type: [String],
    example: ['d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'],
  })
  @IsArray({ message: MSG.VALIDATION.ARRAY('Permission Action IDs') })
  @IsUUID('4', {
    each: true,
    message: MSG.VALIDATION.INVALID_UUID('Each Permission Action ID'),
  })
  permissionActionIds: string[];
}

export class RemoveRolePermissionsDto {
  @ApiProperty({
    description: 'Array of Permission Action UUIDs to remove from this role',
    type: [String],
    example: ['d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'],
  })
  @IsArray({ message: MSG.VALIDATION.ARRAY('Permission Action IDs') })
  @IsUUID('4', {
    each: true,
    message: MSG.VALIDATION.INVALID_UUID('Each Permission Action ID'),
  })
  permissionActionIds: string[];
}
