import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryEntity } from '../entities/country.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import {
  CreateCountryDto,
  UpdateCountryDto,
  CountryQueryDto,
} from '../dto';
import { UUID_REGEX, MercoraLogger, AuditService } from '../../../common';

@Injectable()
export class CountriesService {
  private readonly logger = new MercoraLogger(CountriesService.name);

  constructor(
    @InjectRepository(CountryEntity)
    private readonly countryRepo: Repository<CountryEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    private readonly audit: AuditService,
  ) { }

  /**
   * Find paginated list of countries with search and status filtering
   */
  async findAll(query: CountryQueryDto = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.countryRepo
      .createQueryBuilder('country')
      .leftJoinAndSelect('country.status', 'status');

    // Fuzzy search
    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(LOWER(country.name) LIKE LOWER(:term) OR LOWER(country.officialName) LIKE LOWER(:term) OR LOWER(country.iso2Code) LIKE LOWER(:term) OR LOWER(country.iso3Code) LIKE LOWER(:term) OR country.phoneCode LIKE :term)',
        { term },
      );
    }

    // Status filter
    if (query.status && query.status.trim()) {
      const st = query.status.trim();
      if (UUID_REGEX.test(st)) {
        qb.andWhere('country.statusId = :st', { st });
      } else {
        qb.andWhere('status.code = :stCode', { stCode: st.toUpperCase() });
      }
    }

    // Sort order & mapping
    const sortFieldMap: Record<string, string> = {
      name: 'country.name',
      iso2_code: 'country.iso2Code',
      iso2Code: 'country.iso2Code',
      iso3_code: 'country.iso3Code',
      iso3Code: 'country.iso3Code',
      phone_code: 'country.phoneCode',
      phoneCode: 'country.phoneCode',
      currency_code: 'country.currencyCode',
      currencyCode: 'country.currencyCode',
      created_at: 'country.createdAt',
      createdAt: 'country.createdAt',
      updated_at: 'country.updatedAt',
      updatedAt: 'country.updatedAt',
    };

    const sortBy = sortFieldMap[query.sort_by || 'name'] || 'country.name';
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
   * Find single country by UUID, ISO2, or ISO3
   */
  async findOne(idOrCode: string): Promise<CountryEntity> {
    if (!idOrCode) {
      throw new BadRequestException('Identifier is required');
    }

    const trimmed = idOrCode.trim();
    let country: CountryEntity | null = null;

    if (UUID_REGEX.test(trimmed)) {
      country = await this.countryRepo.findOne({
        where: { id: trimmed },
        relations: ['status'],
      });
    } else if (trimmed.length === 2) {
      country = await this.countryRepo.findOne({
        where: { iso2Code: trimmed.toUpperCase() },
        relations: ['status'],
      });
    } else if (trimmed.length === 3) {
      country = await this.countryRepo.findOne({
        where: { iso3Code: trimmed.toUpperCase() },
        relations: ['status'],
      });
    } else {
      country = await this.countryRepo.findOne({
        where: { name: trimmed },
        relations: ['status'],
      });
    }

    if (!country) {
      this.logger.warn(`Country not found for identifier: ${idOrCode}`);
      throw new NotFoundException(`Country with identifier '${idOrCode}' was not found.`);
    }

    return country;
  }

  /**
   * Create a new Country record
   */
  async create(dto: CreateCountryDto, actorId?: string): Promise<CountryEntity> {
    const iso2 = dto.iso2Code.trim().toUpperCase();
    const iso3 = dto.iso3Code.trim().toUpperCase();
    const name = dto.name.trim();

    // Check unique constraints
    const existingName = await this.countryRepo.findOne({ where: { name } });
    if (existingName) {
      throw new ConflictException(`Country with name '${name}' already exists.`);
    }

    const existingIso2 = await this.countryRepo.findOne({ where: { iso2Code: iso2 } });
    if (existingIso2) {
      throw new ConflictException(`Country with ISO2 code '${iso2}' already exists.`);
    }

    const existingIso3 = await this.countryRepo.findOne({ where: { iso3Code: iso3 } });
    if (existingIso3) {
      throw new ConflictException(`Country with ISO3 code '${iso3}' already exists.`);
    }

    if (dto.numericCode) {
      const existingNum = await this.countryRepo.findOne({ where: { numericCode: dto.numericCode } });
      if (existingNum) {
        throw new ConflictException(`Country with numeric code '${dto.numericCode}' already exists.`);
      }
    }

    // Default status to ACTIVE if not supplied
    let statusId = dto.statusId;
    if (!statusId && dto.status) {
      const code = dto.status.trim().toUpperCase();
      const found =
        (await this.statusRepo.findOne({ where: { type: 'GEOGRAPHY', code } })) ||
        (await this.statusRepo.findOne({ where: { code } }));
      statusId = found?.id;
    }
    if (!statusId) {
      const activeStatus =
        (await this.statusRepo.findOne({ where: { type: 'GEOGRAPHY', code: 'ACTIVE' } })) ||
        (await this.statusRepo.findOne({ where: { code: 'ACTIVE' } }));
      statusId = activeStatus?.id;
    }

    const country = this.countryRepo.create({
      name,
      officialName: dto.officialName?.trim() || null,
      iso2Code: iso2,
      iso3Code: iso3,
      numericCode: dto.numericCode?.trim() || null,
      phoneCode: dto.phoneCode?.trim() || null,
      currencyCode: dto.currencyCode?.trim().toUpperCase() || null,
      statusId,
      source: dto.source || 'MANUAL',
      sourceCode: dto.sourceCode || null,
      sourceUpdatedAt: new Date(),
    });

    const saved = await this.countryRepo.save(country);

    await this.audit.log({
      action: 'CREATE_COUNTRY',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'CountryEntity',
      entityId: saved.id,
      userId: actorId,
      newData: { id: saved.id, name: saved.name, iso2Code: saved.iso2Code, iso3Code: saved.iso3Code },
    });

    return this.findOne(saved.id);
  }

  /**
   * Update country details
   */
  async update(idOrCode: string, dto: UpdateCountryDto, actorId?: string): Promise<CountryEntity> {
    const country = await this.findOne(idOrCode);
    const oldData = { ...country };

    // Unique checks on modified fields
    if (dto.name && dto.name.trim() !== country.name) {
      const existing = await this.countryRepo.findOne({ where: { name: dto.name.trim() } });
      if (existing && existing.id !== country.id) {
        throw new ConflictException(`Country name '${dto.name}' is already in use.`);
      }
      country.name = dto.name.trim();
    }

    if (dto.iso2Code) {
      const iso2 = dto.iso2Code.trim().toUpperCase();
      if (iso2 !== country.iso2Code) {
        const existing = await this.countryRepo.findOne({ where: { iso2Code: iso2 } });
        if (existing && existing.id !== country.id) {
          throw new ConflictException(`ISO2 code '${iso2}' is already in use.`);
        }
        country.iso2Code = iso2;
      }
    }

    if (dto.iso3Code) {
      const iso3 = dto.iso3Code.trim().toUpperCase();
      if (iso3 !== country.iso3Code) {
        const existing = await this.countryRepo.findOne({ where: { iso3Code: iso3 } });
        if (existing && existing.id !== country.id) {
          throw new ConflictException(`ISO3 code '${iso3}' is already in use.`);
        }
        country.iso3Code = iso3;
      }
    }

    if (dto.numericCode !== undefined) {
      const num = dto.numericCode?.trim() || null;
      if (num && num !== country.numericCode) {
        const existing = await this.countryRepo.findOne({ where: { numericCode: num } });
        if (existing && existing.id !== country.id) {
          throw new ConflictException(`Numeric code '${num}' is already in use.`);
        }
      }
      country.numericCode = num;
    }

    if (dto.officialName !== undefined) {
      country.officialName = dto.officialName?.trim() || null;
    }
    if (dto.phoneCode !== undefined) {
      country.phoneCode = dto.phoneCode?.trim() || null;
    }
    if (dto.currencyCode !== undefined) {
      country.currencyCode = dto.currencyCode?.trim().toUpperCase() || null;
    }
    if (dto.status !== undefined) {
      const code = dto.status.trim().toUpperCase();
      const target =
        (await this.statusRepo.findOne({ where: { type: 'GEOGRAPHY', code } })) ||
        (await this.statusRepo.findOne({ where: { code } }));
      if (target) {
        country.statusId = target.id;
      }
    }
    if (dto.statusId !== undefined) {
      country.statusId = dto.statusId;
    }
    if (dto.source !== undefined) {
      country.source = dto.source;
    }
    if (dto.sourceCode !== undefined) {
      country.sourceCode = dto.sourceCode;
    }

    country.sourceUpdatedAt = new Date();
    await this.countryRepo.save(country);

    await this.audit.log({
      action: 'UPDATE_COUNTRY',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'CountryEntity',
      entityId: country.id,
      userId: actorId,
      oldData,
      newData: { ...country },
    });

    return this.findOne(country.id);
  }

  /**
   * Update country status (activate/deactivate)
   */
  async updateStatus(idOrCode: string, statusInput: string, actorId?: string): Promise<CountryEntity> {
    const country = await this.findOne(idOrCode);
    const oldStatusId = country.statusId;

    let targetStatus: StatusEntity | null = null;
    if (UUID_REGEX.test(statusInput)) {
      targetStatus = await this.statusRepo.findOne({ where: { id: statusInput } });
    } else {
      const code = statusInput.trim().toUpperCase();
      targetStatus =
        (await this.statusRepo.findOne({ where: { type: 'GEOGRAPHY', code } })) ||
        (await this.statusRepo.findOne({ where: { code } }));
    }

    if (!targetStatus) {
      throw new NotFoundException(`Status '${statusInput}' does not exist.`);
    }

    country.statusId = targetStatus.id;
    await this.countryRepo.save(country);

    await this.audit.log({
      action: 'UPDATE_COUNTRY_STATUS',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'CountryEntity',
      entityId: country.id,
      userId: actorId,
      oldData: { statusId: oldStatusId },
      newData: { statusId: targetStatus.id, statusCode: targetStatus.code },
    });

    return this.findOne(country.id);
  }

  /**
   * Soft-delete country or deactivate
   */
  async remove(idOrCode: string, actorId?: string): Promise<{ success: boolean; message: string }> {
    const country = await this.findOne(idOrCode);

    // Prefer deactivation / soft-delete to preserve references
    await this.countryRepo.softDelete(country.id);

    // Also mark status as INACTIVE if available
    const inactiveStatus = await this.statusRepo.findOne({ where: { code: 'INACTIVE' } });
    if (inactiveStatus) {
      country.statusId = inactiveStatus.id;
      await this.countryRepo.save(country);
    }

    await this.audit.log({
      action: 'SOFT_DELETE_COUNTRY',
      module: 'GEOGRAPHIC_MASTER',
      entityType: 'CountryEntity',
      entityId: country.id,
      userId: actorId,
      oldData: { id: country.id, name: country.name, iso2Code: country.iso2Code },
    });

    return {
      success: true,
      message: `Country '${country.name}' (${country.iso2Code}) has been successfully soft-deleted.`,
    };
  }

  /**
   * Baseline Seeder for Countries
   */
  async seedBaseline(): Promise<{ seeded: number; skipped: number; total: number; message: string }> {
    const total = await this.countryRepo.count();
    const message = total > 0
      ? `Database already contains ${total} country records. No static seeding needed.`
      : 'No static country seed data configured. Please import country records via standard API or CSV upload.';
    this.logger.log(message);

    return {
      seeded: 0,
      skipped: 0,
      total,
      message,
    };
  }
}
