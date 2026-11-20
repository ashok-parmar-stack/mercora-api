import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubDistrictEntity } from '../entities/sub-district.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import { DistrictEntity } from '../../districts/entities/district.entity';
import {
  CreateSubDistrictDto,
  UpdateSubDistrictDto,
  SubDistrictQueryDto,
} from '../dto';
import { UUID_REGEX, MercoraLogger, AuditService } from '../../../common';

@Injectable()
export class SubDistrictsService {
  private readonly logger = new MercoraLogger(SubDistrictsService.name);

  constructor(
    @InjectRepository(SubDistrictEntity)
    private readonly subDistrictRepo: Repository<SubDistrictEntity>,
    @InjectRepository(DistrictEntity)
    private readonly districtRepo: Repository<DistrictEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: SubDistrictQueryDto = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.subDistrictRepo
      .createQueryBuilder('subDistrict')
      .leftJoinAndSelect('subDistrict.district', 'district')
      .leftJoinAndSelect('subDistrict.status', 'status');

    if (query.districtId) {
      qb.andWhere('subDistrict.districtId = :districtId', { districtId: query.districtId });
    }

    if (query.type) {
      qb.andWhere('subDistrict.type = :type', { type: query.type });
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(LOWER(subDistrict.name) LIKE LOWER(:term) OR LOWER(subDistrict.localName) LIKE LOWER(:term) OR LOWER(subDistrict.code) LIKE LOWER(:term) OR LOWER(subDistrict.censusCode) LIKE LOWER(:term))',
        { term },
      );
    }

    if (query.status && query.status.trim()) {
      const st = query.status.trim();
      if (UUID_REGEX.test(st)) {
        qb.andWhere('subDistrict.statusId = :st', { st });
      } else {
        qb.andWhere('status.code = :stCode', { stCode: st.toUpperCase() });
      }
    }

    const sortFieldMap: Record<string, string> = {
      name: 'subDistrict.name',
      code: 'subDistrict.code',
      district: 'district.name',
      districtId: 'subDistrict.districtId',
      type: 'subDistrict.type',
      censusCode: 'subDistrict.censusCode',
      source: 'subDistrict.source',
      status: 'status.name',
      createdAt: 'subDistrict.createdAt',
      updatedAt: 'subDistrict.updatedAt',
    };

    const sortBy = sortFieldMap[query.sort_by || 'name'] || 'subDistrict.name';
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
    let subDistrict: SubDistrictEntity | null = null;
    const qb = this.subDistrictRepo
      .createQueryBuilder('subDistrict')
      .leftJoinAndSelect('subDistrict.district', 'district')
      .leftJoinAndSelect('subDistrict.status', 'status');

    if (UUID_REGEX.test(idOrCode)) {
      qb.where('subDistrict.id = :id', { id: idOrCode });
    } else {
      qb.where('subDistrict.code = :code', { code: idOrCode });
    }

    subDistrict = await qb.getOne();
    if (!subDistrict) {
      throw new NotFoundException(`SubDistrict with identifier '${idOrCode}' not found`);
    }
    return subDistrict;
  }

  async create(dto: CreateSubDistrictDto, userId: string = 'system') {
    // Verify District
    const district = await this.districtRepo.findOne({ where: { id: dto.districtId } });
    if (!district) {
      throw new BadRequestException(`District with ID '${dto.districtId}' not found`);
    }

    // Check duplicate code
    const existing = await this.subDistrictRepo.findOne({
      where: { code: dto.code, districtId: dto.districtId },
    });
    if (existing) {
      throw new ConflictException(`SubDistrict with code '${dto.code}' already exists in this district.`);
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
    const subDistrict = this.subDistrictRepo.create({
      ...restDto,
      statusId: activeStatusId,
      source: dto.source || 'SYSTEM',
    });

    const saved = await this.subDistrictRepo.save(subDistrict);
    await this.audit.log({
      userId,
      action: 'CREATE_SUB_DISTRICT',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'SubDistrictEntity',
      entityId: saved.id,
      newData: saved,
    });
    return this.findOne(saved.id);
  }

  async update(idOrCode: string, dto: UpdateSubDistrictDto, userId: string = 'system') {
    const subDistrict = await this.findOne(idOrCode);
    const before = { ...subDistrict };

    if (dto.code && dto.code !== subDistrict.code) {
      const existing = await this.subDistrictRepo.findOne({
        where: { code: dto.code, districtId: subDistrict.districtId },
      });
      if (existing) {
        throw new ConflictException(`SubDistrict with code '${dto.code}' already exists in this district.`);
      }
    }

    let newStatusId = subDistrict.statusId;
    if (dto.status) {
      const isUuid = UUID_REGEX.test(dto.status);
      const st = await this.statusRepo.findOne({
        where: isUuid ? { id: dto.status } : { type: 'GEOGRAPHY', code: dto.status.toUpperCase() },
      });
      if (st) {
        newStatusId = st.id;
      }
    }

    Object.assign(subDistrict, {
      ...dto,
      statusId: newStatusId,
    });
    
    // Clean up dto.status as it's not a real column
    delete (subDistrict as any).status;

    const saved = await this.subDistrictRepo.save(subDistrict);
    await this.audit.log({
      userId,
      action: 'UPDATE_SUB_DISTRICT',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'SubDistrictEntity',
      entityId: saved.id,
      oldData: before,
      newData: saved,
    });
    return this.findOne(saved.id);
  }

  async updateStatus(idOrCode: string, statusIdentifier: string, userId: string = 'system') {
    const subDistrict = await this.findOne(idOrCode);
    const before = { ...subDistrict };

    const isUuid = UUID_REGEX.test(statusIdentifier);
    const status = await this.statusRepo.findOne({
      where: isUuid ? { id: statusIdentifier } : { type: 'GEOGRAPHY', code: statusIdentifier.toUpperCase() },
    });

    if (!status) {
      throw new NotFoundException(`Status '${statusIdentifier}' not found`);
    }

    subDistrict.statusId = status.id;
    const saved = await this.subDistrictRepo.save(subDistrict);
    await this.audit.log({
      userId,
      action: 'UPDATE_SUB_DISTRICT_STATUS',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'SubDistrictEntity',
      entityId: saved.id,
      oldData: before,
      newData: saved,
    });
    return this.findOne(saved.id);
  }

  async softDelete(idOrCode: string, userId: string = 'system') {
    const subDistrict = await this.findOne(idOrCode);
    const before = { ...subDistrict };

    const inactiveStatus = await this.statusRepo.findOne({ where: { type: 'GEOGRAPHY', code: 'INACTIVE' } });
    if (inactiveStatus) {
      subDistrict.statusId = inactiveStatus.id;
      await this.subDistrictRepo.save(subDistrict);
    }
    
    await this.subDistrictRepo.softDelete(subDistrict.id);
    await this.audit.log({
      userId,
      action: 'DELETE_SUB_DISTRICT',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'SubDistrictEntity',
      entityId: subDistrict.id,
      oldData: before,
      newData: { deleted: true },
    });
    return true;
  }
}
