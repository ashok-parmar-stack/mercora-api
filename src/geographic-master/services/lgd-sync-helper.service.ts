import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CountryEntity } from '../countries/entities/country.entity';
import { StatusEntity } from '../../database/entities/status.entity';
import { MasterSyncRunEntity } from '../../database/entities/master-sync-run.entity';
import { MasterSyncErrorEntity } from '../../database/entities/master-sync-error.entity';
import { MercoraLogger } from '../../common/logger';

@Injectable()
export class LgdSyncHelperService {
  private readonly logger = new MercoraLogger(LgdSyncHelperService.name);

  constructor(
    @InjectRepository(CountryEntity)
    readonly countryRepo: Repository<CountryEntity>,
    @InjectRepository(StatusEntity)
    readonly statusRepo: Repository<StatusEntity>,
    @InjectRepository(MasterSyncRunEntity)
    readonly syncRunRepo: Repository<MasterSyncRunEntity>,
    @InjectRepository(MasterSyncErrorEntity)
    readonly syncErrorRepo: Repository<MasterSyncErrorEntity>,
    readonly dataSource: DataSource,
  ) {}

  async createSyncRun(masterType: string, source: string): Promise<MasterSyncRunEntity> {
    this.logger.debug(`Creating sync run for master type: ${masterType}, source: ${source}`);
    return this.syncRunRepo.save(
      this.syncRunRepo.create({
        masterType,
        source,
        status: 'RUNNING',
        startedAt: new Date(),
        totalRecords: 0,
        insertedRecords: 0,
        updatedRecords: 0,
        deactivatedRecords: 0,
        failedRecords: 0,
      }),
    );
  }

  async logSyncError(
    syncRunId: string,
    source: string,
    recordIdentifier: string,
    errorMessage: string,
    rawData?: any,
  ): Promise<void> {
    try {
      await this.syncErrorRepo.save(
        this.syncErrorRepo.create({
          syncRunId,
          source,
          recordIdentifier,
          errorType: 'SYNC_RECORD_ERROR',
          errorMessage,
          rawData: rawData ? JSON.parse(JSON.stringify(rawData)) : undefined,
        }),
      );
    } catch {
      // Ignore error log failures during sync pipeline
    }
  }

  async finishSyncRun(
    run: MasterSyncRunEntity,
    stats: { total: number; inserted: number; updated: number; failed: number },
  ): Promise<void> {
    run.totalRecords = stats.total;
    run.insertedRecords = stats.inserted;
    run.updatedRecords = stats.updated;
    run.failedRecords = stats.failed;
    run.status = stats.failed > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    run.completedAt = new Date();
    await this.syncRunRepo.save(run);
  }

  async getActiveStatus(): Promise<StatusEntity | null> {
    return this.statusRepo.findOne({ where: { code: 'ACTIVE' } });
  }

  async ensureIndiaCountry(): Promise<CountryEntity> {
    let india = await this.countryRepo.findOne({
      where: [{ iso2Code: 'IN' }, { name: 'India' }],
    });

    if (!india) {
      const activeStatus = await this.getActiveStatus();
      india = await this.countryRepo.save(
        this.countryRepo.create({
          name: 'India',
          officialName: 'Republic of India',
          iso2Code: 'IN',
          iso3Code: 'IND',
          numericCode: '356',
          phoneCode: '+91',
          currencyCode: 'INR',
          isActive: true,
          statusId: activeStatus?.id,
          source: 'LGD',
          sourceUpdatedAt: new Date(),
          lastSyncedAt: new Date(),
        }),
      );
      this.logger.log('Seeded Republic of India country master record.');
    }
    return india;
  }
}
