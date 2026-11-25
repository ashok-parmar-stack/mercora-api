import { Controller, Get, Post, Query, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { LocationSyncService } from './location-sync.service';
import { LocationQueryService, LocationCityDto } from './location-query.service';
import { Public, Roles, CATALOG_ADMIN_ROLES } from '../common';

export type { LocationCityDto };

@ApiTags('Locations / Dropdowns & Cascades')
@Controller('locations')
export class LocationController {
  constructor(
    private readonly locationQueryService: LocationQueryService,
    private readonly locationSyncService: LocationSyncService,
  ) {}

  @Get('countries')
  @Public()
  @ApiOperation({ summary: 'Get active countries dropdown' })
  @ApiResponse({ status: 200, description: 'Countries fetched successfully' })
  async getCountries() {
    const data = await this.locationQueryService.getCountries();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Countries fetched successfully',
      data,
    };
  }

  @Get('states')
  @Public()
  @ApiOperation({ summary: 'Get states dropdown for a country' })
  @ApiQuery({ name: 'country_id', required: false, description: 'Country UUID filter' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async getStates(
    @Query('country_id') countryId?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.locationQueryService.getStates(countryId, search);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'States fetched successfully',
      data,
    };
  }

  @Get('districts')
  @Public()
  @ApiOperation({ summary: 'Get districts dropdown for a state' })
  @ApiQuery({ name: 'state_id', required: false, description: 'State UUID filter' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async getDistricts(
    @Query('state_id') stateId?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.locationQueryService.getDistricts(stateId, search);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Districts fetched successfully',
      data,
    };
  }

  @Get('sub-districts')
  @Public()
  @ApiOperation({ summary: 'Get sub-districts (talukas/tehsils) dropdown for a district' })
  @ApiQuery({ name: 'district_id', required: false, description: 'District UUID filter' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async getSubDistricts(
    @Query('district_id') districtId?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.locationQueryService.getSubDistricts(districtId, search);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Sub-districts fetched successfully',
      data,
    };
  }

  @Get('cities')
  @Public()
  @ApiOperation({ summary: 'Get active cities and industrial clusters' })
  @ApiQuery({ name: 'state_id', required: false, description: 'State UUID filter' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async getCities(
    @Query('state_id') stateId?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.locationQueryService.getCities(stateId, search);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cities fetched successfully',
      data,
    };
  }

  @Post('sync')
  @Roles(...CATALOG_ADMIN_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute parent-first location sync (LGD)' })
  async syncAll() {
    const result = await this.locationSyncService.syncAllLocations();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }
}
