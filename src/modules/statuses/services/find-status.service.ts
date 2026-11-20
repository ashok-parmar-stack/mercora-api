import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StatusEntity } from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { BaseEntityService } from '../../../common/services';
import { AuditService } from '../../../common/audit';

@Injectable()
export class FindStatusService extends BaseEntityService<StatusEntity> implements OnModuleInit {
  protected readonly entityName = 'Status';
  protected readonly logger = new MercoraLogger(FindStatusService.name);

  constructor(
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    protected readonly audit: AuditService,
  ) {
    super(statusRepo);
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBaselineStatuses();
  }

  /** Ensures essential system statuses exist across entity domains */
  async ensureBaselineStatuses(): Promise<void> {
    try {
      const count = await this.statusRepo.count();
      if (count === 0) {
        this.logger.log('Seeding baseline statuses across entity domains...');
        const baseline = [
          { type: 'USER', code: 'ACTIVE', name: 'Active', description: 'User account is active and verified', isActive: true, sortOrder: 1 },
          { type: 'USER', code: 'INACTIVE', name: 'Inactive', description: 'User account is disabled', isActive: true, sortOrder: 2 },
          { type: 'USER', code: 'SUSPENDED', name: 'Suspended', description: 'User account is temporarily suspended', isActive: true, sortOrder: 3 },
          { type: 'USER', code: 'PENDING', name: 'Pending Verification', description: 'Awaiting email verification', isActive: true, sortOrder: 4 },
          { type: 'ROLE', code: 'ACTIVE', name: 'Active', description: 'Role is active and assignable', isActive: true, sortOrder: 1 },
          { type: 'ROLE', code: 'INACTIVE', name: 'Inactive', description: 'Role is inactive and unassignable', isActive: true, sortOrder: 2 },
          { type: 'PERMISSION', code: 'ACTIVE', name: 'Active', description: 'Permission rule is active', isActive: true, sortOrder: 1 },
          { type: 'PERMISSION', code: 'INACTIVE', name: 'Inactive', description: 'Permission rule is disabled', isActive: true, sortOrder: 2 },
          { type: 'COMPANY', code: 'ACTIVE', name: 'Active', description: 'Company account is active', isActive: true, sortOrder: 1 },
          { type: 'COMPANY', code: 'INACTIVE', name: 'Inactive', description: 'Company account is suspended or inactive', isActive: true, sortOrder: 2 },
          { type: 'LEAD', code: 'NEW', name: 'New Lead', description: 'Fresh lead awaiting contact', isActive: true, sortOrder: 1 },
          { type: 'LEAD', code: 'CONTACTED', name: 'Contacted', description: 'Initial contact made', isActive: true, sortOrder: 2 },
          { type: 'LEAD', code: 'QUALIFIED', name: 'Qualified', description: 'Opportunity verified', isActive: true, sortOrder: 3 },
          { type: 'LEAD', code: 'CONVERTED', name: 'Converted', description: 'Successfully converted to customer', isActive: true, sortOrder: 4 },
          { type: 'LEAD', code: 'LOST', name: 'Lost', description: 'Deal closed without conversion', isActive: true, sortOrder: 5 },
        ];
        await this.statusRepo.save(this.statusRepo.create(baseline));
        this.logger.log(`Baseline statuses successfully seeded (${baseline.length} records).`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not verify baseline statuses: ${err.message}`);
    }
  }

  /** Find all statuses or filter by entity type (USER, ROLE, PERMISSION, COMPANY) */
  async findAll(type?: string): Promise<StatusEntity[]> {
    this.logger.debug('Fetching statuses', { type });
    const count = await this.statusRepo.count();
    if (count === 0) {
      await this.ensureBaselineStatuses();
    }
    const where = type ? { type } : {};
    return this.statusRepo.find({
      where,
      order: { type: 'ASC', sortOrder: 'ASC' },
    });
  }

  /** Find single status by UUID or Code */
  async findOne(idOrCode: string): Promise<StatusEntity> {
    this.logger.debug('Finding status by identifier', { idOrCode });
    return this.findByIdOrSlug(idOrCode, 'code');
  }
}
