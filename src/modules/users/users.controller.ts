import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { DeleteMode } from '../../common/services';
import { Roles, ADMIN_ROLES } from '../../common';
import {
  CreateUserDto,
  UpdateUserDto,
  AssignRoleDto,
  SetUserPermissionsDto,
  AddUserPermissionDto,
  RemoveUserPermissionDto,
  CheckPermissionDto,
  UserQueryDto,
} from './dto';

@ApiTags('Users')
@Roles(...ADMIN_ROLES)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /* ── CRUD ──────────────────────────────────────────────────────────────── */

  @Get()
  @ApiOperation({
    summary: 'List all users',
    description: 'Retrieves all users along with their associated role, status, and company.',
  })
  @ApiResponse({ status: 200, description: 'List of users' })
  findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':idOrSlug')
  @ApiOperation({
    summary: 'Get user by UUID or Slug',
    description: 'Resolves a user using either their public URL slug or internal UUID.',
  })
  @ApiParam({ name: 'idOrSlug', description: 'User slug or UUID', example: 'super-admin' })
  @ApiResponse({ status: 200, description: 'User record' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.usersService.findOne(idOrSlug);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new user',
    description: 'Creates a new user record with automatic unique slug generation.',
  })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'Email or slug already taken' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':idOrSlug')
  @ApiOperation({
    summary: 'Update user profile',
    description: 'Updates user details identified by slug or UUID.',
  })
  @ApiParam({ name: 'idOrSlug', description: 'User slug or UUID', example: 'super-admin' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(idOrSlug, dto);
  }

  @Delete(':idOrSlug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete user and update status to INACTIVE',
    description: 'Performs safe soft-delete, marks user status as INACTIVE, and records audit trail.',
  })
  @ApiParam({ name: 'idOrSlug', description: 'User slug or UUID', example: 'super-admin' })
  @ApiQuery({ name: 'mode', required: false, enum: ['SOFT', 'HARD', 'STATUS'], description: 'Delete mode' })
  @ApiQuery({ name: 'reason', required: false, description: 'Audit reason for deletion' })
  @ApiResponse({ status: 200, description: 'User deleted / deactivated' })
  remove(
    @Param('idOrSlug') idOrSlug: string,
    @Query('mode') mode?: DeleteMode,
    @Query('reason') reason?: string,
    @Query('statusId') statusId?: string,
  ) {
    return this.usersService.remove(idOrSlug, { mode, reason, statusId });
  }

  @Post(':idOrSlug/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a soft-deleted user',
    description: 'Restores a soft-deleted user, resets their status to ACTIVE, and records audit trail.',
  })
  @ApiParam({ name: 'idOrSlug', description: 'User slug or UUID', example: 'super-admin' })
  @ApiResponse({ status: 200, description: 'User restored successfully' })
  restore(@Param('idOrSlug') idOrSlug: string) {
    return this.usersService.restore(idOrSlug);
  }

  /* ── Role Assignment ────────────────────────────────────────────────────── */

  @Patch(':idOrSlug/role')
  @ApiOperation({
    summary: 'Assign role to user',
    description: 'Updates a user assigned role and records audit trail.',
  })
  @ApiParam({ name: 'idOrSlug', description: 'User slug or UUID', example: 'super-admin' })
  @ApiResponse({ status: 200, description: 'Role assigned successfully' })
  assignRole(
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.usersService.assignRole(idOrSlug, dto);
  }

  /* ── User Permission Panel ──────────────────────────────────────────────── */

  @Get(':idOrSlug/permissions')
  @ApiOperation({
    summary: 'Get user permission panel & matrix',
    description: 'Returns effective permissions matrix factoring role defaults and user ALLOW/DENY overrides.',
  })
  @ApiParam({ name: 'idOrSlug', description: 'User slug or UUID', example: 'super-admin' })
  @ApiResponse({ status: 200, description: 'Permission matrix and overrides' })
  getPermissionPanel(@Param('idOrSlug') idOrSlug: string) {
    return this.usersService.getPermissionPanel(idOrSlug);
  }

  @Post(':idOrSlug/permissions/set')
  @ApiOperation({
    summary: 'Replace all user permission overrides',
    description: 'Replaces all user-level ALLOW/DENY permission overrides.',
  })
  @ApiParam({ name: 'idOrSlug', description: 'User slug or UUID', example: 'super-admin' })
  @ApiResponse({ status: 200, description: 'User permission overrides updated' })
  setUserPermissions(
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: SetUserPermissionsDto,
  ) {
    return this.usersService.setUserPermissions(idOrSlug, dto);
  }

  @Post(':idOrSlug/permissions')
  @ApiOperation({
    summary: 'Add / update single permission override for user',
    description: 'Sets a specific permission action to ALLOW or DENY for this user.',
  })
  @ApiParam({ name: 'idOrSlug', description: 'User slug or UUID', example: 'super-admin' })
  @ApiResponse({ status: 200, description: 'Override applied' })
  addUserPermission(
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: AddUserPermissionDto,
  ) {
    return this.usersService.addUserPermission(idOrSlug, dto);
  }

  @Delete(':idOrSlug/permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove specific user permission overrides',
    description: 'Clears custom user overrides so the user inherits their role default.',
  })
  @ApiParam({ name: 'idOrSlug', description: 'User slug or UUID', example: 'super-admin' })
  @ApiResponse({ status: 200, description: 'Overrides removed' })
  removeUserPermissions(
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: RemoveUserPermissionDto,
  ) {
    return this.usersService.removeUserPermissions(idOrSlug, dto);
  }

  @Post(':idOrSlug/permissions/check')
  @ApiOperation({
    summary: 'Evaluate user permission',
    description: 'Evaluates if a user has access to a permission action code (e.g. COMPANIES.EXPORT).',
  })
  @ApiParam({ name: 'idOrSlug', description: 'User slug or UUID', example: 'super-admin' })
  @ApiResponse({ status: 200, description: 'Evaluation result ({ hasPermission, resolvedBy })' })
  checkPermission(
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: CheckPermissionDto,
  ) {
    return this.usersService.checkPermission(idOrSlug, dto);
  }
}
