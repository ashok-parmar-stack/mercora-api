import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StateEntity } from '../states/entities/state.entity';
import { DistrictEntity } from '../districts/entities/district.entity';
import { SubDistrictEntity } from '../sub-districts/entities/sub-district.entity';
import { LgdDistrictSource } from '../sources/lgd/lgd-district.source';
import { LgdSubDistrictSource } from '../sources/lgd/lgd-sub-district.source';
import { MercoraLogger } from '../../common/logger';
import { AuditService } from '../../common/audit';
import { saveInChunksTransactional } from '../../common/utils/bulk-upsert.util';
import { LgdSyncHelperService } from './lgd-sync-helper.service';
import type { LocationSyncStats } from '../location-sync.service';

@Injectable()
export class LocationHierarchySyncService {
  private readonly logger = new MercoraLogger(LocationHierarchySyncService.name);

  constructor(
    @InjectRepository(StateEntity)
    private readonly stateRepo: Repository<StateEntity>,
    @InjectRepository(DistrictEntity)
    private readonly districtRepo: Repository<DistrictEntity>,
    @InjectRepository(SubDistrictEntity)
    private readonly subDistrictRepo: Repository<SubDistrictEntity>,
    private readonly lgdDistrictSource: LgdDistrictSource,
    private readonly lgdSubDistrictSource: LgdSubDistrictSource,
    private readonly syncHelper: LgdSyncHelperService,
    private readonly audit: AuditService,
  ) {}

  async syncDistricts(
    stateLgdCode: string | undefined,
    userId: string,
    ensureStates: () => Promise<LocationSyncStats>,
  ): Promise<LocationSyncStats> {
    this.logger.log(`Starting LGD Districts sync (filter: ${stateLgdCode || 'All'})...`);
    const syncRun = await this.syncHelper.createSyncRun('LOCATION_DISTRICT', 'LGD');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      await this.syncHelper.ensureIndiaCountry();
      const activeStatus = await this.syncHelper.getActiveStatus();

      let states = await this.stateRepo.find();
      if (states.length === 0) {
        await ensureStates();
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

      let rawDistricts: any[] = [];
      if (!stateLgdCode) {
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
        rawDistricts = await this.lgdDistrictSource.fetchDistricts(matched?.lgdCode || clean);
      }

      const existingDistricts = await this.districtRepo.find();
      const existingDistMap = new Map<string, DistrictEntity>();
      for (const d of existingDistricts) {
        if (d.lgdCode) existingDistMap.set(`LGD::${d.lgdCode}`, d);
        if (d.code && d.stateId) existingDistMap.set(`CODE::${d.code}::${d.stateId}`, d);
        if (d.name && d.stateId) existingDistMap.set(`NAME::${d.name.toUpperCase()}::${d.stateId}`, d);
      }

      const toInsert: DistrictEntity[] = [];
      const toUpdate: DistrictEntity[] = [];

      for (const raw of rawDistricts) {
        try {
          const state =
            (raw.stateLgdCode && stateMapByLgd.get(raw.stateLgdCode)) ||
            (raw.stateCode && stateMapByCode.get(raw.stateCode.toUpperCase())) ||
            (raw.stateCode && stateMapByName.get(raw.stateCode.toUpperCase())) ||
            (raw.stateLgdCode && stateMapByName.get(raw.stateLgdCode.toUpperCase()));

          if (!state) {
            failed++;
            await this.syncHelper.logSyncError(
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
            if (raw.lgdCode && existing.lgdCode !== raw.lgdCode) { existing.lgdCode = raw.lgdCode; modified = true; }
            if (raw.stateLgdCode && existing.stateLgdCode !== raw.stateLgdCode) { existing.stateLgdCode = raw.stateLgdCode; modified = true; }
            if (raw.censusCode && existing.censusCode !== raw.censusCode) { existing.censusCode = raw.censusCode; modified = true; }

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

      inserted = await saveInChunksTransactional(this.syncHelper.dataSource, DistrictEntity, toInsert, 200, 'BulkInsertDistricts');
      updated = await saveInChunksTransactional(this.syncHelper.dataSource, DistrictEntity, toUpdate, 200, 'BulkUpdateDistricts');

      const total = await this.districtRepo.count();
      await this.syncHelper.finishSyncRun(syncRun, { total, inserted, updated, failed });

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
      await this.syncHelper.syncRunRepo.save(syncRun);
      throw pipelineErr;
    }
  }

  async syncSubDistricts(
    districtLgdCode: string | undefined,
    userId: string,
    ensureStates: () => Promise<LocationSyncStats>,
  ): Promise<LocationSyncStats> {
    this.logger.log(`Starting LGD Sub-Districts sync (filter: ${districtLgdCode || 'All'})...`);
    const syncRun = await this.syncHelper.createSyncRun('LOCATION_SUBDISTRICT', 'LGD');

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const activeStatus = await this.syncHelper.getActiveStatus();

      let districts = await this.districtRepo.find();
      if (districts.length === 0) {
        await this.syncDistricts(undefined, userId, ensureStates);
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
        if (matched.length > 0) targetDistricts = matched;
      } else {
        const syncedCodes = new Set<string>();
        const syncedRows = await this.subDistrictRepo
          .createQueryBuilder('sd')
          .select('DISTINCT sd.districtLgdCode', 'districtLgdCode')
          .where('sd.districtLgdCode IS NOT NULL')
          .getRawMany<{ districtLgdCode: string }>();
        for (const row of syncedRows) {
          if (row.districtLgdCode) syncedCodes.add(row.districtLgdCode);
        }
        if (syncedCodes.size > 0) {
          targetDistricts = targetDistricts.filter((d) => d.lgdCode && !syncedCodes.has(d.lgdCode));
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
              return distSubList.map((rsd) => ({
                ...rsd,
                districtLgdCode: rsd.districtLgdCode || dist.lgdCode || '',
                stateLgdCode: rsd.stateLgdCode || dist.stateLgdCode || '',
              }));
            } catch {
              return [];
            }
          }),
        );
        for (const res of results) rawSubDistricts.push(...res);
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
      const toUpdate: SubDistrictEntity[] = [];

      for (const raw of rawSubDistricts) {
        try {
          const district =
            (raw.districtLgdCode && districtMapByLgd.get(raw.districtLgdCode)) ||
            (raw.districtLgdCode && districtMapByCode.get(raw.districtLgdCode.toUpperCase())) ||
            (raw.districtLgdCode && districtMapByName.get(raw.districtLgdCode.toUpperCase())) ||
            (raw.code && districtMapByCode.get(raw.code.toUpperCase()));

          if (!district) {
            failed++;
            await this.syncHelper.logSyncError(
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
            if (raw.lgdCode && existing.lgdCode !== raw.lgdCode) { existing.lgdCode = raw.lgdCode; modified = true; }
            if (raw.districtLgdCode && existing.districtLgdCode !== raw.districtLgdCode) { existing.districtLgdCode = raw.districtLgdCode; modified = true; }
            if (raw.censusCode && existing.censusCode !== raw.censusCode) { existing.censusCode = raw.censusCode; modified = true; }

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

      try {
        inserted = await saveInChunksTransactional(this.syncHelper.dataSource, SubDistrictEntity, toInsert, 200, 'BulkInsertSubDistricts');
      } catch (chunkErr: any) {
        this.logger.warn(`Bulk chunk insert failed (${chunkErr?.message}), retrying item-by-item...`);
        for (const item of toInsert) {
          try {
            await this.subDistrictRepo.save(item);
            inserted++;
          } catch {
            failed++;
          }
        }
      }

      updated = await saveInChunksTransactional(this.syncHelper.dataSource, SubDistrictEntity, toUpdate, 200, 'BulkUpdateSubDistricts');

      const total = await this.subDistrictRepo.count();
      await this.syncHelper.finishSyncRun(syncRun, { total, inserted, updated, failed });

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
      await this.syncHelper.syncRunRepo.save(syncRun);
      throw pipelineErr;
    }
  }
}
