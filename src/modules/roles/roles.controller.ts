import {
  Controller,
  Get,
  Post,
  Put,
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
import { RolesService } from './roles.service';
import { DeleteMode } from '../../common/services';
import { Roles, ADMIN_ROLES } from '../../common';
import {
  CreateRoleDto,
  UpdateRoleDto,
  UpdateRolePermissionMatrixDto,
  AddRolePermissionsDto,
  RemoveRolePermissionsDto,
  RoleQueryDto,
} from './dto';

@ApiTags('Roles')
@Roles(...ADMIN_ROLES)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /* ── CRUD ──────────────────────────────────────────────────────────────── */

  @Get()
  @ApiOperation({
    summary: 'List all roles',
    description: 'Retrieves all roles supporting search, status filter, sorting, and pagination.',
  })
  @ApiResponse({ status: 200, description: 'List of roles or paginated role result' })
  findAll(@Query() query: RoleQueryDto) {
    return this.rolesService.findAll(query);
  }

  @Get(':idOrCode')
  @ApiOperation({
    summary: 'Get role by UUID or Code',
    description: 'Retrieves a single role identified by UUID or code (e.g. SUPER_ADMIN).',
  })
  @ApiParam({ name: 'idOrCode', description: 'Role code or UUID', example: 'SUPER_ADMIN' })
  @ApiResponse({ status: 200, description: 'Role record' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  findOne(@Param('idOrCode') idOrCode: string) {
    return this.rolesService.findOne(idOrCode);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new custom role',
    description: 'Creates a custom role record.',
  })
  @ApiResponse({ status: 201, description: 'Role created' })
  @ApiResponse({ status: 409, description: 'Role code already exists' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':idOrCode')
  @ApiOperation({
    summary: 'Update role details',
    description: 'Updates a role display name or description.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Role code or UUID', example: 'DATA_MANAGER' })
  @ApiResponse({ status: 200, description: 'Role updated' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  update(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(idOrCode, dto);
  }

  @Delete(':idOrCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete role and mark INACTIVE',
    description: 'Soft-deletes a custom role (blocks deletion of system roles).',
  })
  @ApiParam({ name: 'idOrCode', description: 'Role code or UUID', example: 'SALES' })
  @ApiQuery({ name: 'mode', required: false, enum: ['SOFT', 'HARD', 'STATUS'] })
  @ApiQuery({ name: 'reason', required: false })
  @ApiResponse({ status: 200, description: 'Role soft-deleted / deactivated' })
  @ApiResponse({ status: 403, description: 'System roles cannot be deleted' })
  remove(
    @Param('idOrCode') idOrCode: string,
    @Query('mode') mode?: DeleteMode,
    @Query('reason') reason?: string,
    @Query('statusId') statusId?: string,
  ) {
    return this.rolesService.remove(idOrCode, { mode, reason, statusId });
  }

  @Post(':idOrCode/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a soft-deleted role',
    description: 'Restores a soft-deleted role and sets status back to ACTIVE.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Role code or UUID', example: 'SALES' })
  @ApiResponse({ status: 200, description: 'Role restored' })
  restore(@Param('idOrCode') idOrCode: string) {
    return this.rolesService.restore(idOrCode);
  }

  /* ── Permission Matrix ──────────────────────────────────────────────────── */

  @Get(':idOrCode/permissions')
  @ApiOperation({
    summary: 'Get role permission matrix',
    description: 'Returns all permission modules, their actions, and whether granted for this role.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Role code or UUID', example: 'ADMIN' })
  @ApiResponse({ status: 200, description: 'Permission matrix array' })
  getPermissionMatrix(@Param('idOrCode') idOrCode: string) {
    return this.rolesService.getPermissionMatrix(idOrCode);
  }

  @Put(':idOrCode/permissions')
  @ApiOperation({
    summary: 'Replace entire role permission matrix',
    description: 'Replaces all granted permission actions for this role.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Role code or UUID', example: 'ADMIN' })
  @ApiResponse({ status: 200, description: 'Updated permission matrix' })
  setPermissionMatrix(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: UpdateRolePermissionMatrixDto,
  ) {
    return this.rolesService.setPermissionMatrix(idOrCode, dto);
  }

  @Post(':idOrCode/permissions/add')
  @ApiOperation({
    summary: 'Add permission actions to role',
    description: 'Incrementally adds permission action grants to the role without removing existing ones.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Role code or UUID', example: 'ADMIN' })
  @ApiResponse({ status: 200, description: 'Updated permission matrix' })
  addPermissions(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: AddRolePermissionsDto,
  ) {
    return this.rolesService.addPermissions(idOrCode, dto);
  }

  @Post(':idOrCode/permissions/remove')
  @ApiOperation({
    summary: 'Remove permission actions from role',
    description: 'Incrementally removes permission action grants from the role.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Role code or UUID', example: 'ADMIN' })
  @ApiResponse({ status: 200, description: 'Updated permission matrix' })
  removePermissions(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: RemoveRolePermissionsDto,
  ) {
    return this.rolesService.removePermissions(idOrCode, dto);
  }
}
