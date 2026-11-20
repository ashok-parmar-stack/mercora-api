import { Controller, Post, Get, Query, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { GeographicSyncService } from '../services/geographic-sync.service';

@ApiTags('Admin / Geographic Master / Government Sync')
@Controller('v1/admin/geography')
export class GeographicSyncController {
  constructor(private readonly syncService: GeographicSyncService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get unified geographic master dashboard metrics' })
  @ApiResponse({ status: 200, description: 'Geographic counts retrieved successfully' })
  async getMetrics() {
    const data = await this.syncService.getDashboardMetrics();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Geographic metrics retrieved successfully.',
      data,
    };
  }

  @Post('sync/lgd-states')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync official Indian States & UTs from Government LGD Directory' })
  @ApiResponse({ status: 200, description: 'LGD states synchronized successfully' })
  async syncLgdStates() {
    const result = await this.syncService.syncLgdStates();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }

  @Post('sync/lgd-districts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync official Indian Districts from Government LGD Directory' })
  @ApiQuery({ name: 'stateCode', required: false, description: 'State ISO/LGD code filter (e.g. IN-GJ)' })
  @ApiResponse({ status: 200, description: 'LGD districts synchronized successfully' })
  async syncLgdDistricts(@Query('stateCode') stateCode?: string) {
    const result = await this.syncService.syncLgdDistricts(stateCode);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }

  @Post('sync/lgd-subdistricts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync official Sub-Districts (Talukas / Tehsils) from Government LGD Directory' })
  @ApiQuery({ name: 'districtCode', required: false, description: 'District code filter' })
  @ApiResponse({ status: 200, description: 'LGD sub-districts synchronized successfully' })
  async syncLgdSubDistricts(@Query('districtCode') districtCode?: string) {
    const result = await this.syncService.syncLgdSubDistricts(districtCode);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }

  @Post('sync/all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run complete Government Geographic Pipeline Sync (States -> Districts -> SubDistricts)' })
  @ApiResponse({ status: 200, description: 'All government pipelines synchronized successfully' })
  async syncAllPipelines() {
    const result = await this.syncService.syncAllPipelines();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }

  @Post('reset-and-sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear all geographic tables, restart identity counters, and re-sync fresh from LGD API' })
  @ApiResponse({ status: 200, description: 'All location master tables cleared and re-synced successfully' })
  async resetAndSync() {
    const result = await this.syncService.clearAllAndResetHierarchy();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }
}
