import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryEntity } from '../../countries/entities/country.entity';
import { StateEntity } from '../../states/entities/state.entity';
import { DistrictEntity } from '../../districts/entities/district.entity';
import { SubDistrictEntity } from '../../sub-districts/entities/sub-district.entity';
import { MasterSyncRunEntity } from '../../../database/entities/master-sync-run.entity';
import { MasterSyncErrorEntity } from '../../../database/entities/master-sync-error.entity';
import { LocationSyncService } from '../../location-sync.service';

import { MercoraLogger } from '../../../common/logger';

export interface SyncSummaryResult {
  source: string;
  inserted: number;
  updated: number;
  skipped: number;
  total: number;
  message: string;
}

@Injectable()
export class GeographicSyncService {
  private readonly logger = new MercoraLogger(GeographicSyncService.name);

  constructor(
    @InjectRepository(CountryEntity)
    private readonly countryRepo: Repository<CountryEntity>,
    @InjectRepository(StateEntity)
    private readonly stateRepo: Repository<StateEntity>,
    @InjectRepository(DistrictEntity)
    private readonly districtRepo: Repository<DistrictEntity>,
    @InjectRepository(SubDistrictEntity)
    private readonly subDistrictRepo: Repository<SubDistrictEntity>,
    @InjectRepository(MasterSyncRunEntity)
    private readonly syncRunRepo: Repository<MasterSyncRunEntity>,
    @InjectRepository(MasterSyncErrorEntity)
    private readonly syncErrorRepo: Repository<MasterSyncErrorEntity>,
    private readonly locationSyncService: LocationSyncService,
  ) { }

  async ensureIndiaCountry(): Promise<CountryEntity> {
    return this.locationSyncService.ensureIndiaCountry();
  }

  async syncLgdStates(userId = 'system'): Promise<SyncSummaryResult> {
    const stats = await this.locationSyncService.syncStates(userId);
    return {
      source: stats.source,
      inserted: stats.inserted,
      updated: stats.updated,
      skipped: stats.skipped,
      total: stats.total,
      message: stats.message,
    };
  }

  async syncLgdDistricts(stateCode?: string, userId = 'system'): Promise<SyncSummaryResult> {
    const stats = await this.locationSyncService.syncDistricts(stateCode, userId);
    return {
      source: stats.source,
      inserted: stats.inserted,
      updated: stats.updated,
      skipped: stats.skipped,
      total: stats.total,
      message: stats.message,
    };
  }

  async syncLgdSubDistricts(districtCode?: string, userId = 'system'): Promise<SyncSummaryResult> {
    const stats = await this.locationSyncService.syncSubDistricts(districtCode, userId);
    return {
      source: stats.source,
      inserted: stats.inserted,
      updated: stats.updated,
      skipped: stats.skipped,
      total: stats.total,
      message: stats.message,
    };
  }

  async syncAllPipelines(userId = 'system') {
    return this.locationSyncService.syncAllLocations(userId);
  }

  async syncAllGovernmentGeography(userId = 'system') {
    return this.locationSyncService.syncAllLocations(userId);
  }

  async clearAllAndResetHierarchy(userId = 'system') {
    return this.locationSyncService.clearAllAndResetHierarchy(userId);
  }

  /**
   * Fast aggregated metrics query for Geography Dashboard
   */
  async getDashboardMetrics() {
    const [
      countriesCount,
      statesCount,
      districtsCount,
      subDistrictsCount,
      recentSyncRuns,
    ] = await Promise.all([
      this.countryRepo.count(),
      this.stateRepo.count(),
      this.districtRepo.count(),
      this.subDistrictRepo.count(),
      this.syncRunRepo.find({
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const recentImports = recentSyncRuns.map((r) => ({
      id: r.id,
      entity: r.masterType,
      source: r.source,
      count: r.insertedRecords + r.updatedRecords,
      date: r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : 'Today',
      status: r.status === 'COMPLETED' || r.status === 'SUCCESS' ? 'SUCCESS' : r.status,
    }));

    return {
      countriesCount,
      statesCount,
      districtsCount,
      subDistrictsCount,
      citiesCount: 0,
      localitiesCount: 0,
      postalCodesCount: 0,
      postOfficesCount: 0,
      recentImports,
    };
  }
}
