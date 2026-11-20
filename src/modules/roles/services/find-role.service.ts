import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RoleEntity,
  RolePermissionEntity,
  PermissionEntity,
} from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { BaseEntityService } from '../../../common/services';
import { AuditService } from '../../../common/audit';

@Injectable()
export class FindRoleService extends BaseEntityService<RoleEntity> {
  protected readonly entityName = 'Role';
  protected readonly logger = new MercoraLogger(FindRoleService.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermRepo: Repository<RolePermissionEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permRepo: Repository<PermissionEntity>,
    protected readonly audit: AuditService,
  ) {
    super(roleRepo);
  }

  /** List all roles with status */
  findAll(): Promise<RoleEntity[]> {
    this.logger.debug('Fetching all roles list');
    return this.roleRepo.find({
      relations: ['status'],
      order: { isSystem: 'DESC', name: 'ASC' },
    });
  }

  /** Get single role by UUID or Code (e.g. SUPER_ADMIN, ADMIN) */
  async findOne(idOrCode: string): Promise<RoleEntity> {
    this.logger.debug('Finding role by identifier', { idOrCode });
    return this.findByIdOrSlug(idOrCode, 'code', {
      relations: ['status'],
    });
  }

  /**
   * Returns the full permission matrix for a role.
   * Grouped by permission (module), each with all its actions and a `granted` boolean.
   */
  async getPermissionMatrix(idOrCode: string) {
    const role = await this.findOne(idOrCode);

    // All permissions with their actions
    const permissions = await this.permRepo.find({
      relations: ['actions', 'actions.status'],
      order: { name: 'ASC' },
    });

    // IDs granted to this role
    const grantedRows = await this.rolePermRepo.find({ where: { roleId: role.id } });
    const grantedSet = new Set(grantedRows.map((r) => r.permissionActionId));

    return permissions.map((perm) => ({
      permission: {
        id: perm.id,
        code: perm.code,
        name: perm.name,
        description: perm.description,
      },
      actions: (perm.actions || []).map((action) => ({
        id: action.id,
        code: action.code,
        name: action.name,
        description: action.description,
        granted: grantedSet.has(action.id),
      })),
    }));
  }
}
