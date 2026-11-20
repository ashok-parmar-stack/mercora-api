import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryEntity } from './countries/entities/country.entity';
import { StateEntity } from './states/entities/state.entity';
import { DistrictEntity } from './districts/entities/district.entity';
import { SubDistrictEntity } from './sub-districts/entities/sub-district.entity';
import { StatusEntity } from '../database/entities/status.entity';
import { MasterSyncRunEntity } from '../database/entities/master-sync-run.entity';
import { MasterSyncErrorEntity } from '../database/entities/master-sync-error.entity';
import { LgdStateSource } from './sources/lgd/lgd-state.source';
import { LgdDistrictSource } from './sources/lgd/lgd-district.source';
import { LgdSubDistrictSource } from './sources/lgd/lgd-sub-district.source';
import { MercoraLogger } from '../common/logger';
import { AuditService } from '../common/audit';

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
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    @InjectRepository(MasterSyncRunEntity)
    private readonly syncRunRepo: Repository<MasterSyncRunEntity>,
    @InjectRepository(MasterSyncErrorEntity)
    private readonly syncErrorRepo: Repository<MasterSyncErrorEntity>,
    private readonly lgdStateSource: LgdStateSource,
    private readonly lgdDistrictSource: LgdDistrictSource,
    private readonly lgdSubDistrictSource: LgdSubDistrictSource,
    private readonly audit: AuditService,
  ) { }

  /**
   * Helper to initialize a traceable master sync run record
   */
  private async createSyncRun(masterType: string, source: string): Promise<MasterSyncRunEntity> {
    this.logger.debug(`Creating sync run for master type: ${masterType}, source: ${source}`);
    const run = this.syncRunRepo.create({
      masterType,
      source,
      status: 'RUNNING',
      startedAt: new Date(),
      totalRecords: 0,
      insertedRecords: 0,
      updatedRecords: 0,
      deactivatedRecords: 0,
      failedRecords: 0,
    });
    return this.syncRunRepo.save(run);
  }

  /**
   * Helper to record individual sync errors without breaking complete process
   */
  private async logSyncError(
    syncRunId: string,
    source: string,
    recordIdentifier: string,
    errorMessage: string,
    rawData?: any,
  ): Promise<void> {
    try {
      const err = this.syncErrorRepo.create({
        syncRunId,
        source,
        recordIdentifier,
        errorType: 'SYNC_RECORD_ERROR',
        errorMessage,
        rawData: rawData ? JSON.parse(JSON.stringify(rawData)) : undefined,
      });
      await this.syncErrorRepo.save(err);
    } catch {
      // Ignore logging failure to maintain sync flow
    }
  }

  /**
   * Helper to complete sync run with status (SUCCESS or PARTIAL_SUCCESS)
   */
  private async finishSyncRun(
    run: MasterSyncRunEntity,
    stats: { total: number; inserted: number; updated: number; failed: number },
  ): Promise<void> {
    run.status = stats.failed > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    run.completedAt = new Date();
    run.totalRecords = stats.total;
    run.insertedRecords = stats.inserted;
    run.updatedRecords = stats.updated;
    run.failedRecords = stats.failed;
    await this.syncRunRepo.save(run);
  }

  private async getActiveStatus(): Promise<StatusEntity | null> {
    return (
      (await this.statusRepo.findOne({ where: { type: 'GEOGRAPHY', code: 'ACTIVE' } })) ||
      (await this.statusRepo.findOne({ where: { code: 'ACTIVE' } }))
    );
  }

  /**
   * 1. COUNTRY: Ensure India country record is seeded
   */
  async ensureIndiaCountry(): Promise<CountryEntity> {
    let india = await this.countryRepo.findOne({
      where: [{ iso2Code: 'IN' }, { name: 'India' }],
    });

    if (!india) {
      const activeStatus = await this.getActiveStatus();
      india = this.countryRepo.create({
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
      });
      india = await this.countryRepo.save(india);
      this.logger.log('Seeded Republic of India country master record.');
    }
    return india;
  }

  /**
   * 2. STATES / UTs: Synchronize official States & UTs from LGD
   */
  async syncStates(userId = 'system'): Promise<LocationSyncStats> {
    this.logger.log('Starting LGD States & UTs sync (Parent: Country)...');
    const syncRun = await this.createSyncRun('LOCATION_STATE', 'LGD');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const india = await this.ensureIndiaCountry();
      const activeStatus = await this.getActiveStatus();
      const rawStates = await this.lgdStateSource.fetchStates();

      for (const raw of rawStates) {
        try {
          const existing = await this.stateRepo.findOne({
            where: [
              { lgdCode: raw.lgdCode, countryId: india.id },
              { code: raw.code, countryId: india.id },
              { name: raw.name, countryId: india.id },
            ],
          });

          if (!existing) {
            const newState = this.stateRepo.create({
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
            });
            await this.stateRepo.save(newState);
            inserted++;
          } else {
            let modified = false;
            if (raw.lgdCode && existing.lgdCode !== raw.lgdCode) {
              existing.lgdCode = raw.lgdCode;
              modified = true;
            }
            if (raw.censusCode && existing.censusCode !== raw.censusCode) {
              existing.censusCode = raw.censusCode;
              modified = true;
            }
            if (raw.localName && existing.localName !== raw.localName) {
              existing.localName = raw.localName;
              modified = true;
            }
            if (raw.name && existing.name !== raw.name) {
              existing.name = raw.name;
              modified = true;
            }
            if (raw.type && existing.type !== raw.type) {
              existing.type = raw.type;
              modified = true;
            }
            if (modified) {
              existing.source = 'LGD';
              existing.sourceUpdatedAt = new Date();
              existing.lastSyncedAt = new Date();
              await this.stateRepo.save(existing);
              updated++;
            } else {
              skipped++;
            }
          }
        } catch (recordErr: any) {
          failed++;
          await this.logSyncError(syncRun.id, 'LGD', raw.lgdCode || raw.code, recordErr?.message, raw);
        }
      }

      // ── CLEANUP & DEDUPLICATION OF OBSOLETE / DUPLICATE STATES ───────────────
      // 1. Resolve merged UT: "Dadra and Nagar Haveli and Daman and Diu"
      const canonicalDnhDd = await this.stateRepo.findOne({
        where: [
          { name: 'Dadra and Nagar Haveli and Daman and Diu' },
          { code: 'IN-DH' },
        ],
      });

      if (canonicalDnhDd) {
        // Find obsolete separate entries
        const obsoleteStates = await this.stateRepo.find({
          where: [
            { code: 'IN-DA' },
            { code: 'IN-DD' },
            { name: 'Dadra and Nagar Haveli' },
            { name: 'Daman and Diu' },
          ],
        });

        for (const obs of obsoleteStates) {
          if (obs.id !== canonicalDnhDd.id) {
            // Re-point any child districts to the unified canonical state
            await this.districtRepo.update({ stateId: obs.id }, { stateId: canonicalDnhDd.id, stateLgdCode: canonicalDnhDd.lgdCode });
            await this.stateRepo.delete(obs.id);
            this.logger.log(`Merged and removed obsolete state record '${obs.name}' (${obs.code}).`);
          }
        }
      }

      // 2. Remove duplicate states with empty LGD codes when a canonical LGD state exists
      const allStates = await this.stateRepo.find({ where: { countryId: india.id } });
      const nameGroups = new Map<string, StateEntity[]>();
      for (const s of allStates) {
        const key = s.name.trim().toLowerCase();
        const list = nameGroups.get(key) || [];
        list.push(s);
        nameGroups.set(key, list);
      }

      for (const [, group] of nameGroups) {
        if (group.length > 1) {
          // Keep the one with valid LGD code, remove duplicates
          const canonical = group.find((s) => Boolean(s.lgdCode)) || group[0];
          for (const s of group) {
            if (s.id !== canonical.id) {
              await this.districtRepo.update({ stateId: s.id }, { stateId: canonical.id });
              await this.stateRepo.delete(s.id);
              this.logger.log(`Removed duplicate state record '${s.name}' (${s.id}).`);
            }
          }
        }
      }

      const total = await this.stateRepo.count();
      await this.finishSyncRun(syncRun, { total, inserted, updated, failed });

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
      await this.syncRunRepo.save(syncRun);
      throw pipelineErr;
    }
  }

  /**
   * 3. DISTRICTS: Synchronize official Districts from LGD
   */
  async syncDistricts(stateLgdCode?: string, userId = 'system'): Promise<LocationSyncStats> {
    this.logger.log(`Starting LGD Districts sync (filter: ${stateLgdCode || 'All'})...`);
    const syncRun = await this.createSyncRun('LOCATION_DISTRICT', 'LGD');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      await this.ensureIndiaCountry();
      const activeStatus = await this.getActiveStatus();

      // Ensure states are populated
      let states = await this.stateRepo.find();
      if (states.length === 0) {
        await this.syncStates(userId);
        states = await this.stateRepo.find();
      }

      const stateMapByLgd = new Map<string, StateEntity>();
      const stateMapByCode = new Map<string, StateEntity>();
      const stateMapByName = new Map<string, StateEntity>();

      for (const st of states) {
        if (st.lgdCode) stateMapByLgd.set(st.lgdCode, st);
        if (st.code) stateMapByCode.set(st.code.toUpperCase(), st);
        if (st.name) stateMapByName.set(st.name.toUpperCase(), st);
      }

      // Resolve target states (single state or all states)
      let targetStates = states;
      if (stateLgdCode) {
        const clean = stateLgdCode.trim();
        const matched = states.filter(
          (s) =>
            s.code.toUpperCase() === clean.toUpperCase() ||
            s.lgdCode === clean ||
            s.id === clean ||
            s.name.toUpperCase() === clean.toUpperCase(),
        );
        if (matched.length > 0) {
          targetStates = matched;
        }
      }

      let rawDistricts: any[] = [];
      if (!stateLgdCode) {
        // Fetch all official districts across all 36 states directly from LGD
        rawDistricts = await this.lgdDistrictSource.fetchDistricts();
      } else {
        const clean = stateLgdCode.trim();
        const matched = states.find(
          (s) =>
            s.code.toUpperCase() === clean.toUpperCase() ||
            s.lgdCode === clean ||
            s.id === clean ||
            s.name.toUpperCase() === clean.toUpperCase(),
        );
        const codeToUse = matched?.lgdCode || clean;
        rawDistricts = await this.lgdDistrictSource.fetchDistricts(codeToUse);
      }

      const existingDistricts = await this.districtRepo.find();
      const existingDistMap = new Map<string, DistrictEntity>();

      for (const d of existingDistricts) {
        if (d.lgdCode) existingDistMap.set(`LGD::${d.lgdCode}`, d);
        if (d.code && d.stateId) existingDistMap.set(`CODE::${d.code}::${d.stateId}`, d);
        if (d.name && d.stateId) existingDistMap.set(`NAME::${d.name.toUpperCase()}::${d.stateId}`, d);
      }

      const toInsert: DistrictEntity[] = [];

      for (const raw of rawDistricts) {
        try {
          // Resolve parent State
          const state =
            (raw.stateLgdCode && stateMapByLgd.get(raw.stateLgdCode)) ||
            (raw.stateCode && stateMapByCode.get(raw.stateCode.toUpperCase())) ||
            (raw.stateCode && stateMapByName.get(raw.stateCode.toUpperCase())) ||
            (raw.stateLgdCode && stateMapByName.get(raw.stateLgdCode.toUpperCase()));

          if (!state) {
            failed++;
            await this.logSyncError(
              syncRun.id,
              'LGD',
              raw.lgdCode || raw.code,
              `Cannot resolve parent State for District '${raw.name}' (State LGD: ${raw.stateLgdCode || 'N/A'})`,
              raw,
            );
            continue;
          }

          const existing =
            (raw.lgdCode && existingDistMap.get(`LGD::${raw.lgdCode}`)) ||
            (raw.code && existingDistMap.get(`CODE::${raw.code}::${state.id}`)) ||
            existingDistMap.get(`NAME::${raw.name.toUpperCase()}::${state.id}`);

          if (!existing) {
            const newDist = this.districtRepo.create({
              name: raw.name,
              localName: raw.localName,
              code: raw.code || `DIST-${raw.lgdCode || raw.name.toUpperCase()}`,
              lgdCode: raw.lgdCode,
              stateLgdCode: raw.stateLgdCode || state.lgdCode,
              stateId: state.id,
              type: 'DISTRICT',
              censusCode: raw.censusCode,
              isActive: true,
              statusId: activeStatus?.id,
              source: 'LGD',
              sourceUpdatedAt: new Date(),
              lastSyncedAt: new Date(),
            });
            toInsert.push(newDist);
            if (raw.lgdCode) existingDistMap.set(`LGD::${raw.lgdCode}`, newDist);
          } else {
            let modified = false;
            if (raw.lgdCode && existing.lgdCode !== raw.lgdCode) {
              existing.lgdCode = raw.lgdCode;
              modified = true;
            }
            if (raw.stateLgdCode && existing.stateLgdCode !== raw.stateLgdCode) {
              existing.stateLgdCode = raw.stateLgdCode;
              modified = true;
            }
            if (raw.censusCode && existing.censusCode !== raw.censusCode) {
              existing.censusCode = raw.censusCode;
              modified = true;
            }
            if (modified) {
              existing.source = 'LGD';
              existing.sourceUpdatedAt = new Date();
              existing.lastSyncedAt = new Date();
              await this.districtRepo.save(existing);
              updated++;
            } else {
              skipped++;
            }
          }
        } catch (recordErr: any) {
          failed++;
          await this.logSyncError(syncRun.id, 'LGD', raw.lgdCode || raw.code, recordErr?.message, raw);
        }
      }

      // Bulk save new districts in chunks of 200
      const chunkSize = 200;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        await this.districtRepo.save(chunk);
        inserted += chunk.length;
      }

      const total = await this.districtRepo.count();
      await this.finishSyncRun(syncRun, { total, inserted, updated, failed });

      const message = `LGD Districts Sync: ${inserted} inserted, ${updated} updated, ${skipped} unchanged, ${failed} failed (Total: ${total}).`;
      this.logger.log(message);

      await this.audit.log({
        userId,
        action: 'SYNC_LGD_DISTRICTS',
        module: 'LOCATION_MASTER',
        newData: { inserted, updated, skipped, failed, total },
      });

      return { source: 'LGD', masterType: 'LOCATION_DISTRICT', total, inserted, updated, skipped, failed, message };
    } catch (pipelineErr: any) {
      syncRun.status = 'FAILED';
      syncRun.errorMessage = pipelineErr?.message;
      syncRun.completedAt = new Date();
      await this.syncRunRepo.save(syncRun);
      throw pipelineErr;
    }
  }

  /**
   * 4. SUB-DISTRICTS: Synchronize official Sub-Districts (Talukas / Tehsils) from LGD
   */
  async syncSubDistricts(districtLgdCode?: string, userId = 'system'): Promise<LocationSyncStats> {
    this.logger.log(`Starting LGD Sub-Districts sync (filter: ${districtLgdCode || 'All'})...`);
    const syncRun = await this.createSyncRun('LOCATION_SUBDISTRICT', 'LGD');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const activeStatus = await this.getActiveStatus();

      // Ensure districts exist — but never auto-cascade if districts are already populated
      let districts = await this.districtRepo.find();
      if (districts.length === 0) {
        this.logger.log('Districts table is empty — bootstrapping districts before sub-district sync...');
        await this.syncDistricts(undefined, userId);
        districts = await this.districtRepo.find();
      }

      const districtMapByLgd = new Map<string, DistrictEntity>();
      const districtMapByCode = new Map<string, DistrictEntity>();
      const districtMapByName = new Map<string, DistrictEntity>();

      for (const d of districts) {
        if (d.lgdCode) districtMapByLgd.set(d.lgdCode, d);
        if (d.code) districtMapByCode.set(d.code.toUpperCase(), d);
        if (d.name) districtMapByName.set(d.name.toUpperCase(), d);
      }

      // Resolve target districts (single district or all districts)
      let targetDistricts = districts;
      if (districtLgdCode) {
        const clean = districtLgdCode.trim();
        const matched = districts.filter(
          (d) =>
            d.code.toUpperCase() === clean.toUpperCase() ||
            d.lgdCode === clean ||
            d.id === clean ||
            d.name.toUpperCase() === clean.toUpperCase(),
        );
        if (matched.length > 0) {
          targetDistricts = matched;
        }
      }

      // ── FRESHNESS GUARD ──────────────────────────────────────────────────────
      // If syncing all sub-districts and the table already has data,
      // only re-fetch districts whose sub-districts haven't been synced yet.
      // This prevents re-hammering the LGD API (700+ calls) on every server restart.
      if (!districtLgdCode) {
        const syncedDistrictLgdCodes = new Set<string>();
        const existingSubDistSample = await this.subDistrictRepo
          .createQueryBuilder('sd')
          .select('DISTINCT sd.districtLgdCode', 'districtLgdCode')
          .where('sd.districtLgdCode IS NOT NULL')
          .getRawMany<{ districtLgdCode: string }>();
        for (const row of existingSubDistSample) {
          if (row.districtLgdCode) syncedDistrictLgdCodes.add(row.districtLgdCode);
        }
        if (syncedDistrictLgdCodes.size > 0) {
          // Only fetch for districts that have never been synced
          const unsynced = targetDistricts.filter(
            (d) => d.lgdCode && !syncedDistrictLgdCodes.has(d.lgdCode),
          );
          if (unsynced.length === 0) {
            this.logger.log('All districts already have sub-districts synced — skipping LGD API fetch.');
            // Still run the DB upsert pass with existing records (no remote calls)
            targetDistricts = [];
          } else {
            this.logger.log(`Fetching sub-districts for ${unsynced.length} un-synced districts only.`);
            targetDistricts = unsynced;
          }
        }
      }

      const rawSubDistricts: any[] = [];
      const batchSize = 15;
      for (let i = 0; i < targetDistricts.length; i += batchSize) {
        const batch = targetDistricts.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (dist) => {
            try {
              const distSubList = await this.lgdSubDistrictSource.fetchSubDistricts(dist.lgdCode || dist.code);
              return distSubList.map((rsd) => {
                if (!rsd.districtLgdCode) rsd.districtLgdCode = dist.lgdCode || '';
                if (!rsd.stateLgdCode) rsd.stateLgdCode = dist.stateLgdCode || '';
                return rsd;
              });
            } catch {
              return [];
            }
          }),
        );
        for (const res of results) {
          rawSubDistricts.push(...res);
        }
        if (i + batchSize < targetDistricts.length) {
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
      }

      const existingSubDistricts = await this.subDistrictRepo.find();
      const existingSubDistMap = new Map<string, SubDistrictEntity>();

      for (const sd of existingSubDistricts) {
        if (sd.lgdCode) existingSubDistMap.set(`LGD::${sd.lgdCode}`, sd);
        if (sd.code && sd.districtId) existingSubDistMap.set(`CODE::${sd.code}::${sd.districtId}`, sd);
        if (sd.name && sd.districtId) existingSubDistMap.set(`NAME::${sd.name.toUpperCase()}::${sd.districtId}`, sd);
      }

      const toInsert: SubDistrictEntity[] = [];

      for (const raw of rawSubDistricts) {
        try {
          // Resolve parent District
          const district =
            (raw.districtLgdCode && districtMapByLgd.get(raw.districtLgdCode)) ||
            (raw.districtLgdCode && districtMapByCode.get(raw.districtLgdCode.toUpperCase())) ||
            (raw.districtLgdCode && districtMapByName.get(raw.districtLgdCode.toUpperCase())) ||
            (raw.code && districtMapByCode.get(raw.code.toUpperCase()));

          if (!district) {
            failed++;
            await this.logSyncError(
              syncRun.id,
              'LGD',
              raw.lgdCode || raw.code,
              `Cannot resolve parent District for Sub-District '${raw.name}' (District LGD: ${raw.districtLgdCode || 'N/A'})`,
              raw,
            );
            continue;
          }

          const existing =
            (raw.lgdCode && existingSubDistMap.get(`LGD::${raw.lgdCode}`)) ||
            (raw.code && existingSubDistMap.get(`CODE::${raw.code}::${district.id}`)) ||
            existingSubDistMap.get(`NAME::${raw.name.toUpperCase()}::${district.id}`);

          if (!existing) {
            const newSubDist = this.subDistrictRepo.create({
              name: raw.name,
              localName: raw.localName,
              code: raw.code || `SD-${raw.lgdCode || raw.name.toUpperCase()}`,
              lgdCode: raw.lgdCode,
              districtLgdCode: raw.districtLgdCode || district.lgdCode,
              stateLgdCode: raw.stateLgdCode || district.stateLgdCode,
              districtId: district.id,
              type: 'SUB_DISTRICT',
              censusCode: raw.censusCode,
              isActive: true,
              statusId: activeStatus?.id,
              source: 'LGD',
              sourceUpdatedAt: new Date(),
              lastSyncedAt: new Date(),
            });
            toInsert.push(newSubDist);
            if (raw.lgdCode) existingSubDistMap.set(`LGD::${raw.lgdCode}`, newSubDist);
          } else {
            let modified = false;
            if (raw.lgdCode && existing.lgdCode !== raw.lgdCode) {
              existing.lgdCode = raw.lgdCode;
              modified = true;
            }
            if (raw.districtLgdCode && existing.districtLgdCode !== raw.districtLgdCode) {
              existing.districtLgdCode = raw.districtLgdCode;
              modified = true;
            }
            if (raw.censusCode && existing.censusCode !== raw.censusCode) {
              existing.censusCode = raw.censusCode;
              modified = true;
            }
            if (modified) {
              existing.source = 'LGD';
              existing.sourceUpdatedAt = new Date();
              existing.lastSyncedAt = new Date();
              await this.subDistrictRepo.save(existing);
              updated++;
            } else {
              skipped++;
            }
          }
        } catch (recordErr: any) {
          failed++;
          await this.logSyncError(syncRun.id, 'LGD', raw.lgdCode || raw.code, recordErr?.message, raw);
        }
      }

      // Bulk save new sub-districts in chunks of 200 with fallback to individual inserts on constraint collision
      const chunkSize = 200;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        try {
          await this.subDistrictRepo.save(chunk);
          inserted += chunk.length;
        } catch (chunkErr: any) {
          this.logger.warn(`Chunk save failed (${chunkErr?.message}), retrying item-by-item...`);
          for (const item of chunk) {
            try {
              // Verify district exists in DB
              const distExists = await this.districtRepo.findOne({ where: { id: item.districtId } });
              if (distExists) {
                await this.subDistrictRepo.save(item);
                inserted++;
              } else {
                failed++;
              }
            } catch {
              failed++;
            }
          }
        }
      }

      const total = await this.subDistrictRepo.count();
      await this.finishSyncRun(syncRun, { total, inserted, updated, failed });

      const message = `LGD Sub-Districts Sync: ${inserted} inserted, ${updated} updated, ${skipped} unchanged, ${failed} failed (Total: ${total}).`;
      this.logger.log(message);

      await this.audit.log({
        userId,
        action: 'SYNC_LGD_SUB_DISTRICTS',
        module: 'LOCATION_MASTER',
        newData: { inserted, updated, skipped, failed, total },
      });

      return { source: 'LGD', masterType: 'LOCATION_SUBDISTRICT', total, inserted, updated, skipped, failed, message };
    } catch (pipelineErr: any) {
      syncRun.status = 'FAILED';
      syncRun.errorMessage = pipelineErr?.message;
      syncRun.completedAt = new Date();
      await this.syncRunRepo.save(syncRun);
      throw pipelineErr;
    }
  }

  /**
   * Complete Parent-First Administrative Synchronization:
   * Country -> States -> Districts -> Sub-Districts
   */
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

  /**
   * Complete Reset & Clean Re-Sync:
   * Clears geographic tables, restarts identities, seeds fresh India country, and executes clean synchronization
   */
  async clearAllAndResetHierarchy(userId = 'system') {
    this.logger.warn('Clearing all geographic records and restarting identities...');

    try {
      // Cascaded deletion across remaining geographic entities
      await this.stateRepo.query('DROP TABLE IF EXISTS "post-offices", "postal-codes", "localities", "cities" CASCADE;').catch(() => {});
      await this.stateRepo.query('DELETE FROM "sub-districts";').catch(() => {});
      await this.stateRepo.query('DELETE FROM districts;').catch(() => {});
      await this.stateRepo.query('DELETE FROM states;').catch(() => {});
      await this.stateRepo.query('DELETE FROM countries;').catch(() => {});
      await this.stateRepo.query('DELETE FROM master_sync_errors;').catch(() => {});
      await this.stateRepo.query('DELETE FROM master_sync_runs;').catch(() => {});

      this.logger.log('All geographic tables cleared successfully.');
    } catch (e: any) {
      this.logger.warn(`Truncation query fallback: ${e?.message}`);
      await this.subDistrictRepo.clear().catch(() => {});
      await this.districtRepo.clear().catch(() => {});
      await this.stateRepo.clear().catch(() => {});
      await this.countryRepo.clear().catch(() => {});
    }

    // Seed fresh clean India Country
    const india = await this.ensureIndiaCountry();

    // Synchronize States & UTs from LGD
    const states = await this.syncStates(userId);

    // Synchronize Districts from LGD
    const districts = await this.syncDistricts(undefined, userId);

    // Synchronize Sub-Districts from LGD
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
