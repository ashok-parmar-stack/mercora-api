import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StateEntity } from '../entities/state.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import { CountryEntity } from '../../countries/entities/country.entity';
import {
  CreateStateDto,
  UpdateStateDto,
  StateQueryDto,
} from '../dto';
import { UUID_REGEX, MercoraLogger, AuditService } from '../../../common';

@Injectable()
export class StatesService {
  private readonly logger = new MercoraLogger(StatesService.name);

  constructor(
    @InjectRepository(StateEntity)
    private readonly stateRepo: Repository<StateEntity>,
    @InjectRepository(CountryEntity)
    private readonly countryRepo: Repository<CountryEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: StateQueryDto = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.stateRepo
      .createQueryBuilder('state')
      .leftJoinAndSelect('state.country', 'country')
      .leftJoinAndSelect('state.status', 'status');

    if (query.countryId) {
      qb.andWhere('state.countryId = :countryId', { countryId: query.countryId });
    }

    if (query.type) {
      qb.andWhere('state.type = :type', { type: query.type });
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(LOWER(state.name) LIKE LOWER(:term) OR LOWER(state.localName) LIKE LOWER(:term) OR LOWER(state.code) LIKE LOWER(:term) OR LOWER(state.censusCode) LIKE LOWER(:term))',
        { term },
      );
    }

    if (query.status && query.status.trim()) {
      const st = query.status.trim();
      if (UUID_REGEX.test(st)) {
        qb.andWhere('state.statusId = :st', { st });
      } else {
        qb.andWhere('status.code = :stCode', { stCode: st.toUpperCase() });
      }
    }

    const sortFieldMap: Record<string, string> = {
      name: 'state.name',
      code: 'state.code',
      country: 'country.name',
      countryId: 'state.countryId',
      type: 'state.type',
      censusCode: 'state.censusCode',
      source: 'state.source',
      status: 'status.name',
      createdAt: 'state.createdAt',
      updatedAt: 'state.updatedAt',
    };

    const sortBy = sortFieldMap[query.sort_by || 'name'] || 'state.name';
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
    let state: StateEntity | null = null;
    const qb = this.stateRepo
      .createQueryBuilder('state')
      .leftJoinAndSelect('state.country', 'country')
      .leftJoinAndSelect('state.status', 'status');

    if (UUID_REGEX.test(idOrCode)) {
      qb.where('state.id = :id', { id: idOrCode });
    } else {
      qb.where('state.code = :code', { code: idOrCode });
    }

    state = await qb.getOne();
    if (!state) {
      throw new NotFoundException(`State with identifier '${idOrCode}' not found`);
    }
    return state;
  }

  async create(dto: CreateStateDto, userId: string = 'system') {
    // Verify Country
    const country = await this.countryRepo.findOne({ where: { id: dto.countryId } });
    if (!country) {
      throw new BadRequestException(`Country with ID '${dto.countryId}' not found`);
    }

    // Check duplicate code
    const existing = await this.stateRepo.findOne({
      where: { code: dto.code, countryId: dto.countryId },
    });
    if (existing) {
      throw new ConflictException(`State with code '${dto.code}' already exists in this country.`);
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
    const state = this.stateRepo.create({
      ...restDto,
      statusId: activeStatusId,
      source: dto.source || 'SYSTEM',
    });

    const saved = await this.stateRepo.save(state);
    await this.audit.log({
      userId,
      action: 'CREATE_STATE',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'StateEntity',
      entityId: saved.id,
      newData: saved,
    });
    return this.findOne(saved.id);
  }

  async update(idOrCode: string, dto: UpdateStateDto, userId: string = 'system') {
    const state = await this.findOne(idOrCode);
    const before = { ...state };

    if (dto.code && dto.code !== state.code) {
      const existing = await this.stateRepo.findOne({
        where: { code: dto.code, countryId: state.countryId },
      });
      if (existing) {
        throw new ConflictException(`State with code '${dto.code}' already exists in this country.`);
      }
    }

    let newStatusId = state.statusId;
    if (dto.status) {
      const isUuid = UUID_REGEX.test(dto.status);
      const st = await this.statusRepo.findOne({
        where: isUuid ? { id: dto.status } : { type: 'GEOGRAPHY', code: dto.status.toUpperCase() },
      });
      if (st) {
        newStatusId = st.id;
      }
    }

    Object.assign(state, {
      ...dto,
      statusId: newStatusId,
    });
    
    // Clean up dto.status as it's not a real column
    delete (state as any).status;

    const saved = await this.stateRepo.save(state);
    await this.audit.log({
      userId,
      action: 'UPDATE_STATE',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'StateEntity',
      entityId: saved.id,
      oldData: before,
      newData: saved,
    });
    return this.findOne(saved.id);
  }

  async updateStatus(idOrCode: string, statusIdentifier: string, userId: string = 'system') {
    const state = await this.findOne(idOrCode);
    const before = { ...state };

    const isUuid = UUID_REGEX.test(statusIdentifier);
    const status = await this.statusRepo.findOne({
      where: isUuid ? { id: statusIdentifier } : { type: 'GEOGRAPHY', code: statusIdentifier.toUpperCase() },
    });

    if (!status) {
      throw new NotFoundException(`Status '${statusIdentifier}' not found`);
    }

    state.statusId = status.id;
    const saved = await this.stateRepo.save(state);
    await this.audit.log({
      userId,
      action: 'UPDATE_STATE_STATUS',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'StateEntity',
      entityId: saved.id,
      oldData: before,
      newData: saved,
    });
    return this.findOne(saved.id);
  }

  async softDelete(idOrCode: string, userId: string = 'system') {
    const state = await this.findOne(idOrCode);
    const before = { ...state };

    const inactiveStatus = await this.statusRepo.findOne({ where: { type: 'GEOGRAPHY', code: 'INACTIVE' } });
    if (inactiveStatus) {
      state.statusId = inactiveStatus.id;
      await this.stateRepo.save(state);
    }
    
    await this.stateRepo.softDelete(state.id);
    await this.audit.log({
      userId,
      action: 'DELETE_STATE',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'StateEntity',
      entityId: state.id,
      oldData: before,
      newData: { deleted: true },
    });
    return true;
  }

  /**
   * Baseline Seeder for Indian States & Union Territories
   */
  async seedBaseline(): Promise<{ seeded: number; skipped: number; total: number; message: string }> {
    const total = await this.stateRepo.count();
    const message = total > 0
      ? `Database already contains ${total} state records. No static seeding needed.`
      : 'No static state seed data configured. Please import state records via standard API or CSV upload.';
    this.logger.log(message);

    return {
      seeded: 0,
      skipped: 0,
      total,
      message,
    };
  }
}
