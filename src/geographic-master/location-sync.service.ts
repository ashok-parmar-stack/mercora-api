import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryEntity } from './countries/entities/country.entity';
import { StateEntity } from './states/entities/state.entity';
import { DistrictEntity } from './districts/entities/district.entity';
import { SubDistrictEntity } from './sub-districts/entities/sub-district.entity';
import { LgdStateSource } from './sources/lgd/lgd-state.source';
import { MercoraLogger } from '../common/logger';
import { AuditService } from '../common/audit';
import { saveInChunksTransactional } from '../common/utils/bulk-upsert.util';
import { LgdSyncHelperService } from './services/lgd-sync-helper.service';
import { LocationHierarchySyncService } from './services/location-hierarchy-sync.service';

export interface LocationSyncStats {
  source: string;
  masterType: string;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  message: string;
}

@Injectable()
export class LocationSyncService {
  private readonly logger = new MercoraLogger(LocationSyncService.name);

  constructor(
    @InjectRepository(CountryEntity)
    private readonly countryRepo: Repository<CountryEntity>,
    @InjectRepository(StateEntity)
    private readonly stateRepo: Repository<StateEntity>,
    @InjectRepository(DistrictEntity)
    private readonly districtRepo: Repository<DistrictEntity>,
    @InjectRepository(SubDistrictEntity)
    private readonly subDistrictRepo: Repository<SubDistrictEntity>,
    private readonly lgdStateSource: LgdStateSource,
    private readonly syncHelper: LgdSyncHelperService,
    private readonly hierarchySync: LocationHierarchySyncService,
    private readonly audit: AuditService,
  ) {}

  async ensureIndiaCountry(): Promise<CountryEntity> {
    return this.syncHelper.ensureIndiaCountry();
  }

  async syncStates(userId = 'system'): Promise<LocationSyncStats> {
    this.logger.log('Starting LGD States & UTs sync (Parent: Country)...');
    const syncRun = await this.syncHelper.createSyncRun('LOCATION_STATE', 'LGD');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const india = await this.syncHelper.ensureIndiaCountry();
      const activeStatus = await this.syncHelper.getActiveStatus();
      const rawStates = await this.lgdStateSource.fetchStates();
      const existingStates = await this.stateRepo.find({ where: { countryId: india.id } });

      const byLgd = new Map<string, StateEntity>();
      const byCode = new Map<string, StateEntity>();
      const byName = new Map<string, StateEntity>();
      for (const s of existingStates) {
        if (s.lgdCode) byLgd.set(s.lgdCode, s);
        if (s.code) byCode.set(s.code.toUpperCase(), s);
        if (s.name) byName.set(s.name.toUpperCase(), s);
      }

      const toInsert: StateEntity[] = [];
      const toUpdate: StateEntity[] = [];

      for (const raw of rawStates) {
        try {
          const existing =
            (raw.lgdCode && byLgd.get(raw.lgdCode)) ||
            (raw.code && byCode.get(raw.code.toUpperCase())) ||
            (raw.name && byName.get(raw.name.toUpperCase()));

          if (!existing) {
            toInsert.push(
              this.stateRepo.create({
                name: raw.name,
                localName: raw.localName,
                code: raw.code,
                lgdCode: raw.lgdCode,
                countryId: india.id,
                type: raw.type,
                censusCode: raw.censusCode,
                isActive: true,
                statusId: activeStatus?.id,
                source: 'LGD',
                sourceUpdatedAt: new Date(),
                lastSyncedAt: new Date(),
              }),
            );
          } else {
            let modified = false;
            if (raw.lgdCode && existing.lgdCode !== raw.lgdCode) { existing.lgdCode = raw.lgdCode; modified = true; }
            if (raw.censusCode && existing.censusCode !== raw.censusCode) { existing.censusCode = raw.censusCode; modified = true; }
            if (raw.localName && existing.localName !== raw.localName) { existing.localName = raw.localName; modified = true; }
            if (raw.name && existing.name !== raw.name) { existing.name = raw.name; modified = true; }
            if (raw.type && existing.type !== raw.type) { existing.type = raw.type; modified = true; }

            if (modified) {
              existing.source = 'LGD';
              existing.sourceUpdatedAt = new Date();
              existing.lastSyncedAt = new Date();
              toUpdate.push(existing);
            } else {
              skipped++;
            }
          }
        } catch (recordErr: any) {
          failed++;
          await this.syncHelper.logSyncError(syncRun.id, 'LGD', raw.lgdCode || raw.code, recordErr?.message, raw);
        }
      }

      inserted = await saveInChunksTransactional(this.syncHelper.dataSource, StateEntity, toInsert, 100, 'BulkInsertStates');
      updated = await saveInChunksTransactional(this.syncHelper.dataSource, StateEntity, toUpdate, 100, 'BulkUpdateStates');

      await this.deduplicateObsoleteStates(india.id);

      const total = await this.stateRepo.count();
      await this.syncHelper.finishSyncRun(syncRun, { total, inserted, updated, failed });

      const message = `LGD States Sync: ${inserted} inserted, ${updated} updated, ${skipped} unchanged, ${failed} failed (Total: ${total}).`;
      this.logger.log(message);

      await this.audit.log({
        userId,
        action: 'SYNC_LGD_STATES',
        module: 'LOCATION_MASTER',
        newData: { inserted, updated, skipped, failed, total },
      });

      return { source: 'LGD', masterType: 'LOCATION_STATE', total, inserted, updated, skipped, failed, message };
    } catch (pipelineErr: any) {
      syncRun.status = 'FAILED';
      syncRun.errorMessage = pipelineErr?.message;
      syncRun.completedAt = new Date();
      await this.syncHelper.syncRunRepo.save(syncRun);
      throw pipelineErr;
    }
  }

  private async deduplicateObsoleteStates(indiaId: string): Promise<void> {
    const canonicalDnhDd = await this.stateRepo.findOne({
      where: [{ name: 'Dadra and Nagar Haveli and Daman and Diu' }, { code: 'IN-DH' }],
    });

    if (canonicalDnhDd) {
      const obsolete = await this.stateRepo.find({
        where: [
          { code: 'IN-DA' },
          { code: 'IN-DD' },
          { name: 'Dadra and Nagar Haveli' },
          { name: 'Daman and Diu' },
        ],
      });
      for (const obs of obsolete) {
        if (obs.id !== canonicalDnhDd.id) {
          await this.districtRepo.update(
            { stateId: obs.id },
            { stateId: canonicalDnhDd.id, stateLgdCode: canonicalDnhDd.lgdCode },
          );
          await this.stateRepo.delete(obs.id);
        }
      }
    }

    const allStates = await this.stateRepo.find({ where: { countryId: indiaId } });
    const nameGroups = new Map<string, StateEntity[]>();
    for (const s of allStates) {
      const key = s.name.trim().toLowerCase();
      const list = nameGroups.get(key) || [];
      list.push(s);
      nameGroups.set(key, list);
    }
    for (const [, group] of nameGroups) {
      if (group.length > 1) {
        const canonical = group.find((s) => Boolean(s.lgdCode)) || group[0];
        for (const s of group) {
          if (s.id !== canonical.id) {
            await this.districtRepo.update({ stateId: s.id }, { stateId: canonical.id });
            await this.stateRepo.delete(s.id);
          }
        }
      }
    }
  }

  async syncDistricts(stateLgdCode?: string, userId = 'system'): Promise<LocationSyncStats> {
    return this.hierarchySync.syncDistricts(stateLgdCode, userId, () => this.syncStates(userId));
  }

  async syncSubDistricts(districtLgdCode?: string, userId = 'system'): Promise<LocationSyncStats> {
    return this.hierarchySync.syncSubDistricts(districtLgdCode, userId, () => this.syncStates(userId));
  }

  async syncAllLocations(userId = 'system') {
    this.logger.log('Executing full parent-first administrative hierarchy sync...');
    const country = await this.ensureIndiaCountry();
    const states = await this.syncStates(userId);
    const districts = await this.syncDistricts(undefined, userId);
    const subDistricts = await this.syncSubDistricts(undefined, userId);

    return {
      country: { id: country.id, name: country.name, iso2Code: country.iso2Code },
      states,
      districts,
      subDistricts,
      message: `Parent-first administrative sync completed: ${states.inserted} states, ${districts.inserted} districts, ${subDistricts.inserted} sub-districts added.`,
    };
  }

  async clearAllAndResetHierarchy(userId = 'system') {
    this.logger.warn('Clearing all geographic records and restarting identities...');

    try {
      await this.stateRepo.query('DROP TABLE IF EXISTS "post-offices", "postal-codes", "localities", "cities" CASCADE;').catch(() => {});
      await this.stateRepo.query('DELETE FROM "sub-districts";').catch(() => {});
      await this.stateRepo.query('DELETE FROM districts;').catch(() => {});
      await this.stateRepo.query('DELETE FROM states;').catch(() => {});
      await this.stateRepo.query('DELETE FROM countries;').catch(() => {});
      await this.stateRepo.query('DELETE FROM master_sync_errors;').catch(() => {});
      await this.stateRepo.query('DELETE FROM master_sync_runs;').catch(() => {});
    } catch {
      await this.subDistrictRepo.clear().catch(() => {});
      await this.districtRepo.clear().catch(() => {});
      await this.stateRepo.clear().catch(() => {});
      await this.countryRepo.clear().catch(() => {});
    }

    const india = await this.ensureIndiaCountry();
    const states = await this.syncStates(userId);
    const districts = await this.syncDistricts(undefined, userId);
    const subDistricts = await this.syncSubDistricts(undefined, userId);

    return {
      country: { id: india.id, name: india.name, iso2Code: india.iso2Code },
      states,
      districts,
      subDistricts,
      message: `Location hierarchy cleared and fresh synchronization complete: ${states.inserted} states/UTs, ${districts.inserted} districts, ${subDistricts.inserted} sub-districts synchronized from LGD.`,
    };
  }
}
