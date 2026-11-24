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
import { isUUID } from '../../../common/constants';
import { RoleQueryDto } from '../dto/role-query.dto';

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

  /** List roles with server-side search, filtering, sorting, and pagination */
  async findAll(query: RoleQueryDto = {}) {
    this.logger.debug('Fetching roles list with query filters', query);
    const qb = this.roleRepo
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.status', 'status');

    const shouldIncludeDeleted =
      query.includeDeleted === true || query.includeDeleted === 'true';
    if (shouldIncludeDeleted) {
      qb.withDeleted();
    }

    if (query.statusId && query.statusId !== 'ALL') {
      const isUuid = isUUID(String(query.statusId));
      if (isUuid || !isNaN(Number(query.statusId))) {
        qb.andWhere('role.statusId = :statusId', { statusId: query.statusId });
      } else {
        qb.andWhere('status.code = :statusCode', { statusCode: String(query.statusId).toUpperCase() });
      }
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(LOWER(role.name) LIKE LOWER(:term) OR LOWER(role.code) LIKE LOWER(:term) OR LOWER(role.description) LIKE LOWER(:term))',
        { term },
      );
    }

    // Sort Mapping
    const sortFieldMap: Record<string, string> = {
      name: 'role.name',
      code: 'role.code',
      description: 'role.description',
      priority: 'role.priority',
      createdAt: 'role.createdAt',
      created_at: 'role.createdAt',
      status: 'status.name',
      isSystem: 'role.isSystem',
    };

    const rawSortBy = query.sortBy || query.sort_by;
    const sortField = rawSortBy ? sortFieldMap[rawSortBy] : null;
    const rawSortOrder = query.sortOrder || query.sort_order || 'ASC';
    const sortOrder = rawSortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    if (sortField) {
      qb.orderBy(sortField, sortOrder);
    } else {
      qb.orderBy('role.isSystem', 'DESC').addOrderBy('role.name', 'ASC');
    }

    // Server-side pagination
    if (query.page !== undefined || query.limit !== undefined) {
      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
      const skip = (page - 1) * limit;

      qb.skip(skip).take(limit);

      const [items, total] = await qb.getManyAndCount();
      const totalPages = Math.ceil(total / limit) || 1;

      return {
        items,
        total,
        page,
        limit,
        totalPages,
      };
    }

    // If no pagination parameters provided (backward compatible)
    return qb.getMany();
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
