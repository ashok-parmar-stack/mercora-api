import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import { BaseEntityService } from '../../../common/services';
import { CreateRoleDto } from '../dto';

@Injectable()
export class CreateRoleService extends BaseEntityService<RoleEntity> {
  protected readonly entityName = 'Role';
  protected readonly logger = new MercoraLogger(CreateRoleService.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    protected readonly audit: AuditService,
  ) {
    super(roleRepo);
  }

  /**
   * Create a new custom role.
   * Debugging: If role creation or code collision fails, debug only this method.
   */
  async create(dto: CreateRoleDto, actorId?: string): Promise<RoleEntity> {
    this.logger.debug('Creating role', { code: dto.code, name: dto.name });
    await this.ensureUnique('code', dto.code);

    const role = this.roleRepo.create({ ...dto, isSystem: false });
    const savedRole = await this.roleRepo.save(role);

    await this.recordAudit({
      userId: actorId,
      action: 'CREATE_ROLE',
      module: 'ROLE_MANAGEMENT',
      entityType: 'RoleEntity',
      entityId: savedRole.id,
      newData: { code: savedRole.code, name: savedRole.name },
    });

    this.logger.info(`Role created successfully: ${savedRole.code}`, {
      roleId: savedRole.id,
    });
    return savedRole;
  }
}
