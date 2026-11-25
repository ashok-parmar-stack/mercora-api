import { Controller, Post, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LocationSyncService } from './location-sync.service';
import { Roles, CATALOG_ADMIN_ROLES } from '../common';

@ApiTags('Admin / Master Data / Location')
@Roles(...CATALOG_ADMIN_ROLES)
@Controller('admin/master-data/location')
export class AdminLocationSyncController {
  constructor(
    private readonly locationSyncService: LocationSyncService,
  ) {}

  /**
   * Admin-Only Location Master Sync Operation
   * POST /admin/master-data/location/sync
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger complete parent-first Location Master synchronization from official LGD' })
  @ApiResponse({ status: 200, description: 'Location synchronization executed successfully' })
  async syncMasterData() {
    const result = await this.locationSyncService.syncAllLocations('admin-ui');
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }
}
