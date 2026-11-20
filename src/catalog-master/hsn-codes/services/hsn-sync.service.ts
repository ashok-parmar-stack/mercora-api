import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { HsnCodeEntity, HsnLevelType } from '../entities/hsn-code.entity';
import { MasterSyncRunEntity } from '../../../database/entities/master-sync-run.entity';
import { MasterSyncErrorEntity } from '../../../database/entities/master-sync-error.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import { IcegateSourceAdapter } from '../adapters/icegate-source.adapter';
import { MercoraLogger } from '../../../common/logger';

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
      // 1. Fetch raw government records
      const rawRecords = await this.icegateAdapter.fetchOfficialRecords();
      run.totalRecords = rawRecords.length;

      // 2. Resolve default active status
      const activeStatus = await this.statusRepo.findOne({
        where: { code: 'ACTIVE' },
      });
      const statusId = activeStatus?.id || null;

      // Map to keep track of created/existing entities by code for instant parent resolution
      const codeToEntityMap = new Map<string, HsnCodeEntity>();

      // Load existing records into map
      const existingRecords = await this.hsnRepo.find();
      for (const rec of existingRecords) {
        codeToEntityMap.set(rec.code, rec);
      }

      // 3. Ingestion Pass 1: Chapters (2-digit) & Headings (4-digit)
      const pass1Records = rawRecords.filter(
        (r) => r.level === 'CHAPTER_2' || r.level === 'HEADING_4',
      );
      for (let i = 0; i < pass1Records.length; i++) {
        const raw = pass1Records[i];
        try {
          let parentId: string | null = null;
          if (raw.level === 'HEADING_4') {
            const parentChapterCode = raw.code.substring(0, 2);
            const parent = codeToEntityMap.get(parentChapterCode);
            if (parent) {
              parentId = parent.id;
            }
          }

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
              lastSyncedAt: new Date(),
            });
            const saved = await this.hsnRepo.save(newEntity);
            codeToEntityMap.set(saved.code, saved);
            inserted++;
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
            existing.lastSyncedAt = new Date();
            await this.hsnRepo.save(existing);
            if (hasChanged) {
              updated++;
            } else {
              unchanged++;
            }
          }
        } catch (err: any) {
          failed++;
          await this.syncErrorRepo.save({
            syncRunId: run.id,
            rowNumber: i + 1,
            sourceCode: raw.code,
            errorType: 'INGESTION_ERROR',
            errorMessage: err?.message || 'Failed to save record',
            rawData: raw as any,
          });
        }
      }

      // 4. Ingestion Pass 2: Subheadings (6-digit) & Tariff Items (8-digit)
      const pass2Records = rawRecords.filter(
        (r) => r.level === 'SUBHEADING_6' || r.level === 'TARIFF_8',
      );
      for (let i = 0; i < pass2Records.length; i++) {
        const raw = pass2Records[i];
        try {
          let parentId: string | null = null;
          if (raw.level === 'SUBHEADING_6') {
            const parentHeadingCode = raw.code.substring(0, 4);
            const parent = codeToEntityMap.get(parentHeadingCode);
            if (parent) {
              parentId = parent.id;
            }
          } else if (raw.level === 'TARIFF_8') {
            const parentSubheadingCode = raw.code.substring(0, 6);
            let parent = codeToEntityMap.get(parentSubheadingCode);
            if (!parent) {
              const parentHeadingCode = raw.code.substring(0, 4);
              parent = codeToEntityMap.get(parentHeadingCode);
            }
            if (parent) {
              parentId = parent.id;
            }
          }

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
              lastSyncedAt: new Date(),
            });
            const saved = await this.hsnRepo.save(newEntity);
            codeToEntityMap.set(saved.code, saved);
            inserted++;
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
            existing.lastSyncedAt = new Date();
            await this.hsnRepo.save(existing);
            if (hasChanged) {
              updated++;
            } else {
              unchanged++;
            }
          }
        } catch (err: any) {
          failed++;
          await this.syncErrorRepo.save({
            syncRunId: run.id,
            rowNumber: i + 1,
            sourceCode: raw.code,
            errorType: 'INGESTION_ERROR',
            errorMessage: err?.message || 'Failed to save record',
            rawData: raw as any,
          });
        }
      }

      // 5. Update is_leaf flags
      const allHsndata = await this.hsnRepo.find({ relations: ['children'] });
      for (const item of allHsndata) {
        const isLeaf = !item.children || item.children.length === 0;
        if (item.isLeaf !== isLeaf) {
          item.isLeaf = isLeaf;
          await this.hsnRepo.save(item);
        }
      }

      // 6. Complete Sync Run
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
