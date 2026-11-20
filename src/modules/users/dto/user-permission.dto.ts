import {
  IsString,
  IsUUID,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { MSG } from '../../../common/messages';

export const PERMISSION_EFFECTS = ['ALLOW', 'DENY'] as const;
export type PermissionEffect = (typeof PERMISSION_EFFECTS)[number];

export class AssignRoleDto {
  @ApiProperty({ description: 'Role UUID to assign to user', example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsUUID('4', { message: MSG.VALIDATION.INVALID_UUID('Role ID') })
  roleId: string;
}

export class UserPermissionOverrideDto {
  @ApiProperty({ description: 'Permission Action UUID', example: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44' })
  @IsUUID('4', { message: MSG.VALIDATION.INVALID_UUID('Permission Action ID') })
  permissionActionId: string;

  @ApiProperty({ description: 'Override effect: ALLOW or DENY', enum: PERMISSION_EFFECTS, example: 'ALLOW' })
  @IsEnum(PERMISSION_EFFECTS, {
    message: MSG.VALIDATION.ENUM('Effect', PERMISSION_EFFECTS),
  })
  effect: PermissionEffect;
}

export class SetUserPermissionsDto {
  @ApiProperty({
    description: 'List of permission action overrides for the user',
    type: [UserPermissionOverrideDto],
  })
  @IsArray({ message: MSG.VALIDATION.ARRAY('Overrides') })
  @ValidateNested({ each: true })
  @Type(() => UserPermissionOverrideDto)
  overrides: UserPermissionOverrideDto[];
}

export class AddUserPermissionDto {
  @ApiProperty({ description: 'Permission Action UUID', example: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44' })
  @IsUUID('4', { message: MSG.VALIDATION.INVALID_UUID('Permission Action ID') })
  permissionActionId: string;

  @ApiProperty({ description: 'Override effect: ALLOW or DENY', enum: PERMISSION_EFFECTS, example: 'ALLOW' })
  @IsEnum(PERMISSION_EFFECTS, {
    message: MSG.VALIDATION.ENUM('Effect', PERMISSION_EFFECTS),
  })
  effect: PermissionEffect;
}

export class RemoveUserPermissionDto {
  @ApiProperty({
    description: 'Array of Permission Action UUIDs to remove overrides for',
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

export class CheckPermissionDto {
  @ApiProperty({
    description: 'Permission Action Code in MODULE.ACTION format',
    example: 'COMPANIES.EXPORT',
  })
  @IsString({ message: MSG.VALIDATION.STRING('Permission Action Code') })
  permissionActionCode: string;
}
