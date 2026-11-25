import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HsnCodeEntity, HsnLevelType } from '../entities/hsn-code.entity';
import { MasterSyncRunEntity } from '../../../database/entities/master-sync-run.entity';
import { MasterSyncErrorEntity } from '../../../database/entities/master-sync-error.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import { IcegateSourceAdapter } from '../adapters/icegate-source.adapter';
import { MercoraLogger } from '../../../common/logger';
import { saveInChunksTransactional } from '../../../common/utils/bulk-upsert.util';

const HSN_PASS_ORDER: HsnLevelType[] = [
  'CHAPTER_2',
  'HEADING_4',
  'SUBHEADING_6',
  'TARIFF_8',
];

@Injectable()
export class HsnSyncService {
  private readonly logger = new MercoraLogger(HsnSyncService.name);

  constructor(
    @InjectRepository(HsnCodeEntity)
    private readonly hsnRepo: Repository<HsnCodeEntity>,
    @InjectRepository(MasterSyncRunEntity)
    private readonly syncRunRepo: Repository<MasterSyncRunEntity>,
    @InjectRepository(MasterSyncErrorEntity)
    private readonly syncErrorRepo: Repository<MasterSyncErrorEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    private readonly icegateAdapter: IcegateSourceAdapter,
  ) {}

  private resolveParentId(
    code: string,
    level: string,
    codeToEntityMap: Map<string, HsnCodeEntity>,
  ): string | null {
    if (level === 'HEADING_4') {
      return codeToEntityMap.get(code.substring(0, 2))?.id || null;
    }
    if (level === 'SUBHEADING_6') {
      return codeToEntityMap.get(code.substring(0, 4))?.id || null;
    }
    if (level === 'TARIFF_8') {
      return (
        codeToEntityMap.get(code.substring(0, 6))?.id ||
        codeToEntityMap.get(code.substring(0, 4))?.id ||
        null
      );
    }
    return null;
  }

  private async saveBatchWithErrorTracking(
    runId: string,
    items: Array<{ entity: HsnCodeEntity; rowNumber: number; raw: unknown }>,
    isInsert: boolean,
  ): Promise<{ succeeded: number; failed: number }> {
    let succeeded = 0;
    let failed = 0;
    const chunkSize = 200;

    for (let i = 0; i < items.length; i += chunkSize) {
      const slice = items.slice(i, i + chunkSize);
      try {
        await this.hsnRepo.save(slice.map((item) => item.entity));
        succeeded += slice.length;
      } catch {
        for (const item of slice) {
          try {
            await this.hsnRepo.save(item.entity);
            succeeded++;
          } catch (err: any) {
            failed++;
            await this.syncErrorRepo.save({
              syncRunId: runId,
              rowNumber: item.rowNumber,
              sourceCode: item.entity.code,
              errorType: isInsert ? 'INGESTION_ERROR' : 'UPDATE_ERROR',
              errorMessage: err?.message || 'Failed to save record',
              rawData: item.raw as any,
            });
          }
        }
      }
    }

    return { succeeded, failed };
  }

  /**
   * Run HSN / ITCHS synchronization from official Government source
   */
  async runSync(source = 'ICEGATE', masterType = 'HSN'): Promise<MasterSyncRunEntity> {
    const run = this.syncRunRepo.create({
      masterType,
      source,
      status: 'RUNNING',
      startedAt: new Date(),
    });
    await this.syncRunRepo.save(run);

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;

    try {
      const rawRecords = await this.icegateAdapter.fetchOfficialRecords();
      run.totalRecords = rawRecords.length;

      const activeStatus = await this.statusRepo.findOne({
        where: { code: 'ACTIVE' },
      });
      const statusId = activeStatus?.id || null;

      const codeToEntityMap = new Map<string, HsnCodeEntity>();
      const existingRecords = await this.hsnRepo.find();
      for (const rec of existingRecords) {
        codeToEntityMap.set(rec.code, rec);
      }

      const syncTimestamp = new Date();

      for (const level of HSN_PASS_ORDER) {
        const levelRecords = rawRecords.filter((r) => r.level === level);
        const toInsert: Array<{ entity: HsnCodeEntity; rowNumber: number; raw: unknown }> = [];
        const toUpdate: Array<{ entity: HsnCodeEntity; rowNumber: number; raw: unknown }> = [];
        const unchangedIds: string[] = [];

        for (let i = 0; i < levelRecords.length; i++) {
          const raw = levelRecords[i];
          const parentId = this.resolveParentId(raw.code, raw.level, codeToEntityMap);
          const existing = codeToEntityMap.get(raw.code);

          if (!existing) {
            const newEntity = this.hsnRepo.create({
              code: raw.code,
              name: raw.name,
              description: raw.description,
              level: raw.level as HsnLevelType,
              unit: raw.unit || null,
              parentId,
              statusId,
              source: raw.source,
              sourceCode: raw.sourceCode,
              sourceRecordId: raw.sourceRecordId,
              lastSyncedAt: syncTimestamp,
            });
            codeToEntityMap.set(newEntity.code, newEntity);
            toInsert.push({ entity: newEntity, rowNumber: i + 1, raw });
          } else {
            let hasChanged = false;
            if (existing.name !== raw.name || existing.description !== raw.description) {
              existing.name = raw.name;
              existing.description = raw.description;
              hasChanged = true;
            }
            if (parentId && existing.parentId !== parentId) {
              existing.parentId = parentId;
              hasChanged = true;
            }
            existing.lastSyncedAt = syncTimestamp;

            if (hasChanged) {
              toUpdate.push({ entity: existing, rowNumber: i + 1, raw });
            } else {
              unchangedIds.push(existing.id);
              unchanged++;
            }
          }
        }

        const insertResult = await this.saveBatchWithErrorTracking(run.id, toInsert, true);
        inserted += insertResult.succeeded;
        failed += insertResult.failed;

        const updateResult = await this.saveBatchWithErrorTracking(run.id, toUpdate, false);
        updated += updateResult.succeeded;
        failed += updateResult.failed;

        for (let i = 0; i < unchangedIds.length; i += 500) {
          const idChunk = unchangedIds.slice(i, i + 500);
          await this.hsnRepo
            .createQueryBuilder()
            .update(HsnCodeEntity)
            .set({ lastSyncedAt: syncTimestamp })
            .whereInIds(idChunk)
            .execute();
        }
      }

      // Compute leaf flags from parent references without joining full children graphs
      const allHsnRows = await this.hsnRepo.find({
        select: ['id', 'parentId', 'isLeaf'],
      });
      const parentIds = new Set(
        allHsnRows.map((row) => row.parentId).filter((pid): pid is string => Boolean(pid)),
      );
      const leafUpdates = allHsnRows.filter((row) => {
        const expectedLeaf = !parentIds.has(row.id);
        if (row.isLeaf !== expectedLeaf) {
          row.isLeaf = expectedLeaf;
          return true;
        }
        return false;
      });
      await saveInChunksTransactional(
        this.hsnRepo.manager.connection,
        HsnCodeEntity,
        leafUpdates,
        200,
        'HsnUpdateLeafFlags',
      );

      run.status = failed > 0 ? (inserted + updated > 0 ? 'COMPLETED' : 'FAILED') : 'COMPLETED';
      run.insertedRecords = inserted;
      run.updatedRecords = updated;
      run.unchangedRecords = unchanged;
      run.failedRecords = failed;
      run.completedAt = new Date();
      await this.syncRunRepo.save(run);

      this.logger.log(
        `HSN Sync completed: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged, ${failed} failed.`,
      );

      return run;
    } catch (err: any) {
      run.status = 'FAILED';
      run.errorMessage = err?.message || 'Unknown sync failure';
      run.completedAt = new Date();
      await this.syncRunRepo.save(run);
      this.logger.error(`HSN Sync failed: ${err?.message}`, err?.stack);
      throw err;
    }
  }

  /**
   * List sync runs
   */
  async getSyncRuns(limit = 20): Promise<MasterSyncRunEntity[]> {
    return this.syncRunRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['errors'],
    });
  }

  /**
   * Get single sync run by ID with errors
   */
  async getSyncRunById(id: string): Promise<MasterSyncRunEntity | null> {
    return this.syncRunRepo.findOne({
      where: { id },
      relations: ['errors'],
    });
  }
}
