import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DistrictEntity } from '../entities/district.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import { StateEntity } from '../../states/entities/state.entity';
import {
  CreateDistrictDto,
  UpdateDistrictDto,
  DistrictQueryDto,
} from '../dto';
import { UUID_REGEX, MercoraLogger, AuditService } from '../../../common';

@Injectable()
export class DistrictsService {
  private readonly logger = new MercoraLogger(DistrictsService.name);

  constructor(
    @InjectRepository(DistrictEntity)
    private readonly districtRepo: Repository<DistrictEntity>,
    @InjectRepository(StateEntity)
    private readonly stateRepo: Repository<StateEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    private readonly audit: AuditService,
  ) { }

  async findAll(query: DistrictQueryDto = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.districtRepo
      .createQueryBuilder('district')
      .leftJoinAndSelect('district.state', 'state')
      .leftJoinAndSelect('district.status', 'status');

    if (query.stateId) {
      qb.andWhere('district.stateId = :stateId', { stateId: query.stateId });
    }

    if (query.type) {
      qb.andWhere('district.type = :type', { type: query.type });
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(LOWER(district.name) LIKE LOWER(:term) OR LOWER(district.localName) LIKE LOWER(:term) OR LOWER(district.code) LIKE LOWER(:term) OR LOWER(district.censusCode) LIKE LOWER(:term))',
        { term },
      );
    }

    if (query.status && query.status.trim()) {
      const st = query.status.trim();
      if (UUID_REGEX.test(st)) {
        qb.andWhere('district.statusId = :st', { st });
      } else {
        qb.andWhere('status.code = :stCode', { stCode: st.toUpperCase() });
      }
    }

    const sortFieldMap: Record<string, string> = {
      name: 'district.name',
      code: 'district.code',
      state: 'state.name',
      stateId: 'district.stateId',
      type: 'district.type',
      censusCode: 'district.censusCode',
      source: 'district.source',
      status: 'status.name',
      createdAt: 'district.createdAt',
      updatedAt: 'district.updatedAt',
    };

    const sortBy = sortFieldMap[query.sort_by || 'name'] || 'district.name';
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

  async findOne(idOrCode: string) {
    let district: DistrictEntity | null = null;
    const qb = this.districtRepo
      .createQueryBuilder('district')
      .leftJoinAndSelect('district.state', 'state')
      .leftJoinAndSelect('district.status', 'status');

    if (UUID_REGEX.test(idOrCode)) {
      qb.where('district.id = :id', { id: idOrCode });
    } else {
      qb.where('district.code = :code', { code: idOrCode });
    }

    district = await qb.getOne();
    if (!district) {
      throw new NotFoundException(`District with identifier '${idOrCode}' not found`);
    }
    return district;
  }

  async create(dto: CreateDistrictDto, userId: string = 'system') {
    // Verify State
    const state = await this.stateRepo.findOne({ where: { id: dto.stateId } });
    if (!state) {
      throw new BadRequestException(`State with ID '${dto.stateId}' not found`);
    }

    // Check duplicate code
    const existing = await this.districtRepo.findOne({
      where: { code: dto.code, stateId: dto.stateId },
    });
    if (existing) {
      throw new ConflictException(`District with code '${dto.code}' already exists in this state.`);
    }

    let activeStatusId: string | undefined;
    if (dto.status) {
      const isUuid = UUID_REGEX.test(dto.status);
      const st = await this.statusRepo.findOne({
        where: isUuid ? { id: dto.status } : { type: 'GEOGRAPHY', code: dto.status.toUpperCase() },
      });
      if (st) activeStatusId = st.id;
    }
    if (!activeStatusId) {
      const st = await this.statusRepo.findOne({ where: { type: 'GEOGRAPHY', code: 'ACTIVE' } });
      if (st) activeStatusId = st.id;
    }

    const { status, ...restDto } = dto;
    const district = this.districtRepo.create({
      ...restDto,
      statusId: activeStatusId,
      source: dto.source || 'SYSTEM',
    });

    const saved = await this.districtRepo.save(district);
    await this.audit.log({
      userId,
      action: 'CREATE_DISTRICT',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'DistrictEntity',
      entityId: saved.id,
      newData: saved,
    });
    return this.findOne(saved.id);
  }

  async update(idOrCode: string, dto: UpdateDistrictDto, userId: string = 'system') {
    const district = await this.findOne(idOrCode);
    const before = { ...district };

    if (dto.code && dto.code !== district.code) {
      const existing = await this.districtRepo.findOne({
        where: { code: dto.code, stateId: district.stateId },
      });
      if (existing) {
        throw new ConflictException(`District with code '${dto.code}' already exists in this state.`);
      }
    }

    let newStatusId = district.statusId;
    if (dto.status) {
      const isUuid = UUID_REGEX.test(dto.status);
      const st = await this.statusRepo.findOne({
        where: isUuid ? { id: dto.status } : { type: 'GEOGRAPHY', code: dto.status.toUpperCase() },
      });
      if (st) {
        newStatusId = st.id;
      }
    }

    Object.assign(district, {
      ...dto,
      statusId: newStatusId,
    });

    // Clean up dto.status as it's not a real column
    delete (district as any).status;

    const saved = await this.districtRepo.save(district);
    await this.audit.log({
      userId,
      action: 'UPDATE_DISTRICT',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'DistrictEntity',
      entityId: saved.id,
      oldData: before,
      newData: saved,
    });
    return this.findOne(saved.id);
  }

  async updateStatus(idOrCode: string, statusIdentifier: string, userId: string = 'system') {
    const district = await this.findOne(idOrCode);
    const before = { ...district };

    const isUuid = UUID_REGEX.test(statusIdentifier);
    const status = await this.statusRepo.findOne({
      where: isUuid ? { id: statusIdentifier } : { type: 'GEOGRAPHY', code: statusIdentifier.toUpperCase() },
    });

    if (!status) {
      throw new NotFoundException(`Status '${statusIdentifier}' not found`);
    }

    district.statusId = status.id;
    const saved = await this.districtRepo.save(district);
    await this.audit.log({
      userId,
      action: 'UPDATE_DISTRICT_STATUS',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'DistrictEntity',
      entityId: saved.id,
      oldData: before,
      newData: saved,
    });
    return this.findOne(saved.id);
  }

  async softDelete(idOrCode: string, userId: string = 'system') {
    const district = await this.findOne(idOrCode);
    const before = { ...district };

    const inactiveStatus = await this.statusRepo.findOne({ where: { type: 'GEOGRAPHY', code: 'INACTIVE' } });
    if (inactiveStatus) {
      district.statusId = inactiveStatus.id;
      await this.districtRepo.save(district);
    }

    await this.districtRepo.softDelete(district.id);
    await this.audit.log({
      userId,
      action: 'DELETE_DISTRICT',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'DistrictEntity',
      entityId: district.id,
      oldData: before,
      newData: { deleted: true },
    });
    return true;
  }

  /**
   * Baseline Seeder for Districts
   */
  async seedBaseline(): Promise<{ seeded: number; skipped: number; total: number; message: string }> {
    const total = await this.districtRepo.count();
    const message = total > 0
      ? `Database already contains ${total} district records. No static seeding needed.`
      : 'No static district seed data configured. Please import district records via standard API or CSV upload.';
    this.logger.log(message);

    return {
      seeded: 0,
      skipped: 0,
      total,
      message,
    };
  }
}
