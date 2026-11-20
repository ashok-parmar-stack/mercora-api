import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { HsnCodeEntity, HsnLevelType } from '../entities/hsn-code.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import { CreateHsnCodeDto, UpdateHsnCodeDto, HsnCodeQueryDto } from '../dto';
import { HsnSyncService } from './hsn-sync.service';
import { UUID_REGEX, MercoraLogger, AuditService } from '../../../common';

@Injectable()
export class HsnCodesService {
  private readonly logger = new MercoraLogger(HsnCodesService.name);

  constructor(
    @InjectRepository(HsnCodeEntity)
    private readonly hsnRepo: Repository<HsnCodeEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    private readonly hsnSyncService: HsnSyncService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Find paginated list of HSN codes with filters
   */
  async findAll(query: HsnCodeQueryDto = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 50));
    const skip = (page - 1) * limit;

    const qb = this.hsnRepo
      .createQueryBuilder('hsn')
      .leftJoinAndSelect('hsn.status', 'status')
      .leftJoinAndSelect('hsn.parent', 'parent');

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(hsn.code LIKE :term OR LOWER(hsn.name) LIKE LOWER(:term) OR LOWER(hsn.description) LIKE LOWER(:term))',
        { term },
      );
    }

    if (query.level && query.level.trim()) {
      qb.andWhere('hsn.level = :level', { level: query.level.trim() });
    }

    if (query.parent_id) {
      qb.andWhere('hsn.parentId = :parentId', { parentId: query.parent_id });
    }

    if (query.source) {
      qb.andWhere('hsn.source = :source', { source: query.source });
    }

    if (query.is_leaf !== undefined) {
      qb.andWhere('hsn.isLeaf = :isLeaf', { isLeaf: query.is_leaf });
    }

    if (query.status && query.status.trim()) {
      const st = query.status.trim();
      if (UUID_REGEX.test(st)) {
        qb.andWhere('hsn.statusId = :st', { st });
      } else {
        qb.andWhere('status.code = :stCode', { stCode: st.toUpperCase() });
      }
    }

    const sortFieldMap: Record<string, string> = {
      code: 'hsn.code',
      name: 'hsn.name',
      level: 'hsn.level',
      created_at: 'hsn.createdAt',
      createdAt: 'hsn.createdAt',
      updated_at: 'hsn.updatedAt',
      updatedAt: 'hsn.updatedAt',
    };

    const sortBy = sortFieldMap[query.sort_by || 'code'] || 'hsn.code';
    const sortOrder = (query.sort_order || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    qb.orderBy(sortBy, sortOrder as 'ASC' | 'DESC');
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Return full or scoped hierarchy tree of HSN codes
   */
  async findTree(rootCode?: string): Promise<HsnCodeEntity[]> {
    const qb = this.hsnRepo
      .createQueryBuilder('hsn')
      .leftJoinAndSelect('hsn.status', 'status')
      .orderBy('hsn.code', 'ASC');

    if (rootCode) {
      qb.where('hsn.code LIKE :prefix', { prefix: `${rootCode}%` });
    }

    const allRecords = await qb.getMany();

    // Build tree in-memory
    const map = new Map<string, HsnCodeEntity & { children?: HsnCodeEntity[] }>();
    allRecords.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });

    const roots: HsnCodeEntity[] = [];

    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /**
   * Find direct children of an HSN node
   */
  async findChildren(id: string): Promise<HsnCodeEntity[]> {
    return this.hsnRepo.find({
      where: { parentId: id },
      relations: ['status'],
      order: { code: 'ASC' },
    });
  }

  /**
   * Find single HSN code by UUID or Code string
   */
  async findOne(idOrCode: string): Promise<HsnCodeEntity> {
    if (!idOrCode) {
      throw new BadRequestException('Identifier is required');
    }

    const trimmed = idOrCode.trim();
    let record: HsnCodeEntity | null = null;

    if (UUID_REGEX.test(trimmed)) {
      record = await this.hsnRepo.findOne({
        where: { id: trimmed },
        relations: ['status', 'parent', 'categoryMappings', 'categoryMappings.productCategory'],
      });
    } else {
      record = await this.hsnRepo.findOne({
        where: { code: trimmed },
        relations: ['status', 'parent', 'categoryMappings', 'categoryMappings.productCategory'],
      });
    }

    if (!record) {
      throw new NotFoundException(`HSN Code '${idOrCode}' not found`);
    }

    return record;
  }

  /**
   * Create HSN Code manually (or via API)
   */
  async create(dto: CreateHsnCodeDto): Promise<HsnCodeEntity> {
    const existing = await this.hsnRepo.findOne({
      where: { code: dto.code.trim() },
    });
    if (existing) {
      throw new ConflictException(`HSN Code '${dto.code}' already exists`);
    }

    let statusId: string | null = null;
    if (dto.status) {
      const st = dto.status.trim();
      const statusEntity = UUID_REGEX.test(st)
        ? await this.statusRepo.findOne({ where: { id: st } })
        : await this.statusRepo.findOne({ where: { code: st.toUpperCase() } });
      if (statusEntity) {
        statusId = statusEntity.id;
      }
    } else {
      const def = await this.statusRepo.findOne({ where: { code: 'ACTIVE' } });
      statusId = def?.id || null;
    }

    // Determine level if not supplied
    let level = dto.level;
    if (!level) {
      const digits = dto.code.replace(/\D/g, '').length;
      if (digits <= 2) level = 'CHAPTER_2' as any;
      else if (digits <= 4) level = 'HEADING_4' as any;
      else if (digits <= 6) level = 'SUBHEADING_6' as any;
      else level = 'TARIFF_8' as any;
    }

    const entity = this.hsnRepo.create({
      code: dto.code.trim(),
      name: dto.name.trim(),
      description: dto.description || null,
      parentId: dto.parentId || null,
      level: level as HsnLevelType,
      unit: dto.unit || null,
      isLeaf: true,
      statusId,
      source: dto.source || 'MANUAL',
      sourceCode: dto.sourceCode || null,
      sourceRecordId: dto.sourceRecordId || null,
      lastSyncedAt: new Date(),
    });

    const saved = await this.hsnRepo.save(entity);

    // If parent exists, mark parent as not leaf
    if (dto.parentId) {
      await this.hsnRepo.update(dto.parentId, { isLeaf: false });
    }

    await this.audit.log({
      action: 'CREATE_HSN_CODE',
      module: 'CATALOG_MASTER',
      entityType: 'HsnCodeEntity',
      entityId: saved.id,
      newData: { code: saved.code, name: saved.name },
    });

    return this.findOne(saved.id);
  }

  /**
   * Update HSN Code
   */
  async update(id: string, dto: UpdateHsnCodeDto): Promise<HsnCodeEntity> {
    const record = await this.findOne(id);

    if (dto.name) record.name = dto.name.trim();
    if (dto.description !== undefined) record.description = dto.description;
    if (dto.unit !== undefined) record.unit = dto.unit;
    if (dto.level) record.level = dto.level as HsnLevelType;

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('HSN Code cannot be its own parent');
      }
      record.parentId = dto.parentId;
    }

    if (dto.status) {
      const st = dto.status.trim();
      const statusEntity = UUID_REGEX.test(st)
        ? await this.statusRepo.findOne({ where: { id: st } })
        : await this.statusRepo.findOne({ where: { code: st.toUpperCase() } });
      if (statusEntity) {
        record.statusId = statusEntity.id;
      }
    }

    const saved = await this.hsnRepo.save(record);

    await this.audit.log({
      action: 'UPDATE_HSN_CODE',
      module: 'CATALOG_MASTER',
      entityType: 'HsnCodeEntity',
      entityId: saved.id,
      newData: { code: saved.code, name: saved.name },
    });

    return this.findOne(saved.id);
  }

  /**
   * Soft delete HSN Code
   */
  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const record = await this.findOne(id);

    const childCount = await this.hsnRepo.count({
      where: { parentId: id },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        `Cannot delete HSN code '${record.code}' because it has ${childCount} child codes.`,
      );
    }

    await this.hsnRepo.softDelete(id);

    await this.audit.log({
      action: 'DELETE_HSN_CODE',
      module: 'CATALOG_MASTER',
      entityType: 'HsnCodeEntity',
      entityId: id,
      newData: { code: record.code, name: record.name },
    });


    return {
      success: true,
      message: `HSN Code '${record.code}' deleted successfully.`,
    };
  }

  /**
   * Trigger Government Baseline Sync
   */
  async seedBaseline(source = 'ICEGATE') {
    return this.hsnSyncService.runSync(source, 'HSN');
  }
}
