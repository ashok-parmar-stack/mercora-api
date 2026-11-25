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
import { HsnCodesService } from '../services/hsn-codes.service';
import { HsnSyncService } from '../services/hsn-sync.service';
import { Roles, CATALOG_ADMIN_ROLES } from '../../../common';
import {
  CreateHsnCodeDto,
  UpdateHsnCodeDto,
  HsnCodeQueryDto,
  TriggerSyncDto,
} from '../dto';

@ApiTags('Catalog Master - HSN Codes')
@Roles(...CATALOG_ADMIN_ROLES)
@Controller('v1/admin/hsn-codes')
export class HsnCodesController {
  constructor(
    private readonly hsnCodesService: HsnCodesService,
    private readonly hsnSyncService: HsnSyncService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List HSN codes with pagination and filtering',
    description: 'Retrieves HSN codes supporting page, limit, search, level, parent_id, status, and sorting.',
  })
  @ApiResponse({ status: 200, description: 'Paginated HSN codes retrieved' })
  async findAll(@Query() query: HsnCodeQueryDto) {
    const result = await this.hsnCodesService.findAll(query);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'HSN codes fetched successfully.',
      data: result,
    };
  }

  @Get('tree')
  @ApiOperation({
    summary: 'Get full or scoped HSN hierarchy tree',
    description: 'Returns nested Chapter -> Heading -> Subheading -> Tariff Item tree.',
  })
  @ApiQuery({ name: 'root_code', required: false, description: 'Optional 2-digit chapter root e.g. 69' })
  @ApiResponse({ status: 200, description: 'HSN hierarchy tree retrieved' })
  async getTree(@Query('root_code') rootCode?: string) {
    const result = await this.hsnCodesService.findTree(rootCode);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'HSN tree fetched successfully.',
      data: result,
    };
  }

  @Get('sync-runs')
  @ApiOperation({
    summary: 'List HSN sync run audit logs',
    description: 'Returns historical government source sync runs with record counts and statuses.',
  })
  @ApiResponse({ status: 200, description: 'Sync runs retrieved' })
  async getSyncRuns(@Query('limit') limit?: number) {
    const result = await this.hsnSyncService.getSyncRuns(limit ? Number(limit) : 20);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Sync runs fetched successfully.',
      data: result,
    };
  }

  @Get('sync-runs/:id')
  @ApiOperation({
    summary: 'Get sync run details and error records',
  })
  @ApiParam({ name: 'id', description: 'Sync Run UUID' })
  @ApiResponse({ status: 200, description: 'Sync run details retrieved' })
  async getSyncRunById(@Param('id') id: string) {
    const result = await this.hsnSyncService.getSyncRunById(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Sync run details fetched successfully.',
      data: result,
    };
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger Government HSN synchronization',
    description: 'Pulls latest taxonomy from ICEGATE / CBIC / GST sources and performs diff ingestion.',
  })
  @ApiResponse({ status: 200, description: 'HSN synchronization completed' })
  async triggerSync(@Body() body: TriggerSyncDto) {
    const result = await this.hsnSyncService.runSync(
      body.source || 'ICEGATE',
      body.masterType || 'HSN',
    );
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Government HSN synchronization executed successfully.',
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get single HSN code details by UUID or Code',
  })
  @ApiParam({ name: 'id', description: 'HSN UUID or Code string (e.g. 69072100)' })
  @ApiResponse({ status: 200, description: 'HSN code found' })
  async findOne(@Param('id') id: string) {
    const result = await this.hsnCodesService.findOne(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'HSN code fetched successfully.',
      data: result,
    };
  }

  @Get(':id/children')
  @ApiOperation({
    summary: 'Get direct child sub-codes for a parent HSN node',
  })
  @ApiParam({ name: 'id', description: 'Parent HSN UUID' })
  @ApiResponse({ status: 200, description: 'Direct child codes retrieved' })
  async findChildren(@Param('id') id: string) {
    const result = await this.hsnCodesService.findChildren(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Child HSN codes fetched successfully.',
      data: result,
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Create new HSN Code entry',
  })
  @ApiResponse({ status: 201, description: 'HSN code created' })
  async create(@Body() dto: CreateHsnCodeDto) {
    const result = await this.hsnCodesService.create(dto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'HSN code created successfully.',
      data: result,
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update HSN Code entry',
  })
  @ApiParam({ name: 'id', description: 'HSN UUID' })
  @ApiResponse({ status: 200, description: 'HSN code updated' })
  async update(@Param('id') id: string, @Body() dto: UpdateHsnCodeDto) {
    const result = await this.hsnCodesService.update(id, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'HSN code updated successfully.',
      data: result,
    };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete HSN Code entry',
  })
  @ApiParam({ name: 'id', description: 'HSN UUID' })
  @ApiResponse({ status: 200, description: 'HSN code deleted' })
  async remove(@Param('id') id: string) {
    const result = await this.hsnCodesService.remove(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }
}
