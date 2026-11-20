import { Controller, Get, Post, Query, Param, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryEntity } from './countries/entities/country.entity';
import { StateEntity } from './states/entities/state.entity';
import { DistrictEntity } from './districts/entities/district.entity';
import { SubDistrictEntity } from './sub-districts/entities/sub-district.entity';
import { LocationSyncService } from './location-sync.service';

@ApiTags('Locations / Dropdowns & Cascades')
@Controller('locations')
export class LocationController {
  constructor(
    @InjectRepository(CountryEntity)
    private readonly countryRepo: Repository<CountryEntity>,
    @InjectRepository(StateEntity)
    private readonly stateRepo: Repository<StateEntity>,
    @InjectRepository(DistrictEntity)
    private readonly districtRepo: Repository<DistrictEntity>,
    @InjectRepository(SubDistrictEntity)
    private readonly subDistrictRepo: Repository<SubDistrictEntity>,
    private readonly locationSyncService: LocationSyncService,
  ) {}

  /**
   * 1. Country Dropdown
   * GET /locations/countries
   */
  @Get('countries')
  @ApiOperation({ summary: 'Get active countries dropdown' })
  @ApiResponse({ status: 200, description: 'Countries fetched successfully' })
  async getCountries() {
    let countries = await this.countryRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    if (countries.length === 0) {
      const seeded = await this.locationSyncService.ensureIndiaCountry();
      countries = [seeded];
    }

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Countries fetched successfully',
      data: countries.map((c) => ({
        id: c.id,
        name: c.name,
        isoCode: c.iso2Code,
        iso2Code: c.iso2Code,
        phoneCode: c.phoneCode,
        currencyCode: c.currencyCode,
      })),
    };
  }

  /**
   * 2. State Dropdown
   * GET /locations/states?country_id={countryId}&search={search}
   */
  @Get('states')
  @ApiOperation({ summary: 'Get states dropdown for a country' })
  @ApiQuery({ name: 'country_id', required: false, description: 'Country UUID filter' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async getStates(
    @Query('country_id') countryId?: string,
    @Query('search') search?: string,
  ) {
    const qb = this.stateRepo.createQueryBuilder('state')
      .where('state.isActive = :isActive', { isActive: true });

    if (countryId) {
      qb.andWhere('state.countryId = :countryId', { countryId });
    }

    if (search && search.trim().length >= 2) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(state.name) LIKE :term OR LOWER(state.code) LIKE :term)', { term });
    }

    qb.orderBy('state.name', 'ASC');
    const states = await qb.getMany();

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'States fetched successfully',
      data: states.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        lgdCode: s.lgdCode,
        countryId: s.countryId,
        type: s.type,
      })),
    };
  }

  /**
   * 3. District Dropdown
   * GET /locations/districts?state_id={stateId}&search={search}
   */
  @Get('districts')
  @ApiOperation({ summary: 'Get districts dropdown for a state' })
  @ApiQuery({ name: 'state_id', required: false, description: 'State UUID filter' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async getDistricts(
    @Query('state_id') stateId?: string,
    @Query('search') search?: string,
  ) {
    const qb = this.districtRepo.createQueryBuilder('district')
      .where('district.isActive = :isActive', { isActive: true });

    if (stateId) {
      qb.andWhere('district.stateId = :stateId', { stateId });
    }

    if (search && search.trim().length >= 2) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(district.name) LIKE :term OR LOWER(district.code) LIKE :term)', { term });
    }

    qb.orderBy('district.name', 'ASC');
    const districts = await qb.getMany();

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Districts fetched successfully',
      data: districts.map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
        lgdCode: d.lgdCode,
        stateId: d.stateId,
      })),
    };
  }

  /**
   * 4. Sub-District Dropdown
   * GET /locations/sub-districts?district_id={districtId}&search={search}
   */
  @Get('sub-districts')
  @ApiOperation({ summary: 'Get sub-districts (talukas/tehsils) dropdown for a district' })
  @ApiQuery({ name: 'district_id', required: false, description: 'District UUID filter' })
  @ApiQuery({ name: 'search', required: false, description: 'Search term' })
  async getSubDistricts(
    @Query('district_id') districtId?: string,
    @Query('search') search?: string,
  ) {
    const qb = this.subDistrictRepo.createQueryBuilder('sd')
      .where('sd.isActive = :isActive', { isActive: true });

    if (districtId) {
      qb.andWhere('sd.districtId = :districtId', { districtId });
    }

    if (search && search.trim().length >= 2) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere('(LOWER(sd.name) LIKE :term OR LOWER(sd.code) LIKE :term)', { term });
    }

    qb.orderBy('sd.name', 'ASC');
    const subDistricts = await qb.getMany();

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Sub-districts fetched successfully',
      data: subDistricts.map((sd) => ({
        id: sd.id,
        name: sd.name,
        code: sd.code,
        lgdCode: sd.lgdCode,
        districtId: sd.districtId,
      })),
    };
  }

  /**
   * Initial Master Sync Operation
   * POST /locations/sync
   */
  @Post('sync')
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
