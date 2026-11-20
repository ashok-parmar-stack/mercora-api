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
import { PermissionsService } from './permissions.service';
import { DeleteMode } from '../../common/services';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
  CreatePermissionActionDto,
  UpdatePermissionActionDto,
} from './dto';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  /* ── Permission Modules ────────────────────────────────────────────────── */

  @Get()
  @ApiOperation({
    summary: 'List all permission modules',
    description: 'Returns all permission modules with their child actions.',
  })
  @ApiResponse({ status: 200, description: 'List of permission modules' })
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get('actions')
  @ApiOperation({
    summary: 'Flat list of all permission actions',
    description: 'Returns a flat list of all actions across all modules for easy UI multi-select matrices.',
  })
  @ApiResponse({ status: 200, description: 'Flat list of actions' })
  findAllActions() {
    return this.permissionsService.findAllActions();
  }

  @Get(':idOrCode')
  @ApiOperation({
    summary: 'Get permission module by UUID or Code',
    description: 'Retrieves a single permission module by its UUID or code (e.g. COMPANIES).',
  })
  @ApiParam({ name: 'idOrCode', description: 'Permission code or UUID', example: 'COMPANIES' })
  @ApiResponse({ status: 200, description: 'Permission module' })
  @ApiResponse({ status: 404, description: 'Permission module not found' })
  findOne(@Param('idOrCode') idOrCode: string) {
    return this.permissionsService.findOne(idOrCode);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new permission module',
    description: 'Registers a new permission module resource.',
  })
  @ApiResponse({ status: 201, description: 'Permission created' })
  @ApiResponse({ status: 409, description: 'Permission code already exists' })
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }

  @Patch(':idOrCode')
  @ApiOperation({
    summary: 'Update permission module',
    description: 'Updates a permission module name or description.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Permission code or UUID', example: 'COMPANIES' })
  @ApiResponse({ status: 200, description: 'Permission updated' })
  update(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(idOrCode, dto);
  }

  @Delete(':idOrCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete permission module and mark INACTIVE',
    description: 'Soft-deletes a permission module and sets status to INACTIVE.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Permission code or UUID', example: 'COMPANIES' })
  @ApiQuery({ name: 'mode', required: false, enum: ['SOFT', 'HARD', 'STATUS'] })
  @ApiQuery({ name: 'reason', required: false })
  @ApiResponse({ status: 200, description: 'Permission soft-deleted / deactivated' })
  remove(
    @Param('idOrCode') idOrCode: string,
    @Query('mode') mode?: DeleteMode,
    @Query('reason') reason?: string,
    @Query('statusId') statusId?: string,
  ) {
    return this.permissionsService.remove(idOrCode, { mode, reason, statusId });
  }

  @Post(':idOrCode/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a soft-deleted permission module',
    description: 'Restores a permission module and resets its status to ACTIVE.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Permission code or UUID', example: 'COMPANIES' })
  @ApiResponse({ status: 200, description: 'Permission restored' })
  restore(@Param('idOrCode') idOrCode: string) {
    return this.permissionsService.restore(idOrCode);
  }

  /* ── Permission Actions ─────────────────────────────────────────────────── */

  @Get(':idOrCode/actions')
  @ApiOperation({
    summary: 'List actions for a permission module',
    description: 'Returns all actions under a given permission module.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Permission code or UUID', example: 'COMPANIES' })
  @ApiResponse({ status: 200, description: 'List of actions' })
  findActions(@Param('idOrCode') idOrCode: string) {
    return this.permissionsService.findActions(idOrCode);
  }

  @Get(':idOrCode/actions/:actionIdOrCode')
  @ApiOperation({
    summary: 'Get single action under a permission',
    description: 'Retrieves a single action by UUID or code.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Permission code or UUID', example: 'COMPANIES' })
  @ApiParam({ name: 'actionIdOrCode', description: 'Action code or UUID', example: 'EXPORT' })
  @ApiResponse({ status: 200, description: 'Action record' })
  findOneAction(
    @Param('idOrCode') idOrCode: string,
    @Param('actionIdOrCode') actionIdOrCode: string,
  ) {
    return this.permissionsService.findOneAction(idOrCode, actionIdOrCode);
  }

  @Post(':idOrCode/actions')
  @ApiOperation({
    summary: 'Create action under permission module',
    description: 'Adds an action (e.g. EXPORT) to a permission module.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Permission code or UUID', example: 'COMPANIES' })
  @ApiResponse({ status: 201, description: 'Action created' })
  @ApiResponse({ status: 409, description: 'Action code already exists under this permission' })
  createAction(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: CreatePermissionActionDto,
  ) {
    return this.permissionsService.createAction(idOrCode, dto);
  }

  @Patch(':idOrCode/actions/:actionIdOrCode')
  @ApiOperation({
    summary: 'Update action under permission',
    description: 'Updates an action name or description.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Permission code or UUID', example: 'COMPANIES' })
  @ApiParam({ name: 'actionIdOrCode', description: 'Action code or UUID', example: 'EXPORT' })
  @ApiResponse({ status: 200, description: 'Action updated' })
  updateAction(
    @Param('idOrCode') idOrCode: string,
    @Param('actionIdOrCode') actionIdOrCode: string,
    @Body() dto: UpdatePermissionActionDto,
  ) {
    return this.permissionsService.updateAction(idOrCode, actionIdOrCode, dto);
  }

  @Delete(':idOrCode/actions/:actionIdOrCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete action under permission',
    description: 'Soft-deletes a permission action and marks status INACTIVE.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Permission code or UUID', example: 'COMPANIES' })
  @ApiParam({ name: 'actionIdOrCode', description: 'Action code or UUID', example: 'EXPORT' })
  @ApiResponse({ status: 200, description: 'Action soft-deleted' })
  removeAction(
    @Param('idOrCode') idOrCode: string,
    @Param('actionIdOrCode') actionIdOrCode: string,
    @Query('mode') mode?: DeleteMode,
    @Query('reason') reason?: string,
    @Query('statusId') statusId?: string,
  ) {
    return this.permissionsService.removeAction(idOrCode, actionIdOrCode, { mode, reason, statusId });
  }
}
