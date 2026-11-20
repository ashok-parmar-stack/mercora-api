import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserEntity,
  UserPermissionEntity,
  RolePermissionEntity,
  PermissionEntity,
} from '../../../database/entities';
import { PermissionResolverService } from '../../../database/permission-resolver.service';
import { MercoraLogger } from '../../../common/logger';
import { BaseEntityService } from '../../../common/services';
import { AuditService } from '../../../common/audit';
import { CheckPermissionDto } from '../dto';

@Injectable()
export class FindUserService extends BaseEntityService<UserEntity> {
  protected readonly entityName = 'User';
  protected readonly logger = new MercoraLogger(FindUserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserPermissionEntity)
    private readonly userPermRepo: Repository<UserPermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermRepo: Repository<RolePermissionEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permRepo: Repository<PermissionEntity>,
    private readonly permissionResolver: PermissionResolverService,
    protected readonly audit: AuditService,
  ) {
    super(userRepo);
  }

  /** List users with search and filter parameters */
  findAll(query: {
    roleId?: string;
    statusId?: string;
    includeDeleted?: boolean | string;
    search?: string;
  } = {}): Promise<UserEntity[]> {
    this.logger.debug('Fetching users list with filters', query);
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.status', 'status')
      .leftJoinAndSelect('user.company', 'company');

    const shouldIncludeDeleted =
      query.includeDeleted === true || query.includeDeleted === 'true';
    if (shouldIncludeDeleted) {
      qb.withDeleted();
    }

    if (query.roleId && query.roleId !== 'ALL') {
      qb.andWhere('user.roleId = :roleId', { roleId: query.roleId });
    }

    if (query.statusId && query.statusId !== 'ALL') {
      qb.andWhere('user.statusId = :statusId', { statusId: query.statusId });
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(LOWER(user.name) LIKE LOWER(:term) OR LOWER(user.email) LIKE LOWER(:term) OR LOWER(user.slug) LIKE LOWER(:term) OR LOWER(role.name) LIKE LOWER(:term))',
        { term },
      );
    }

    qb.orderBy('user.createdAt', 'DESC');
    return qb.getMany();
  }

  /**
   * Find a user by UUID or public Slug.
   * Enables user-facing URLs like `/users/john-doe` without exposing raw internal UUID.
   */
  async findOne(idOrSlug: string): Promise<UserEntity> {
    this.logger.debug('Finding user by identifier', { idOrSlug });
    return this.findByIdOrSlug(idOrSlug, 'slug', {
      relations: ['role', 'status', 'company'],
    });
  }

  /**
   * Returns the permission panel for a user:
   * - user role + role permissions
   * - user overrides (ALLOW / DENY)
   * - full effective permission matrix
   */
  async getPermissionPanel(idOrSlug: string) {
    const user = await this.findOne(idOrSlug);

    const permissions = await this.permRepo.find({
      relations: ['actions'],
      order: { name: 'ASC' },
    });

    const roleGrants = user.roleId
      ? await this.rolePermRepo.find({ where: { roleId: user.roleId } })
      : [];
    const roleGrantSet = new Set(roleGrants.map((r) => r.permissionActionId));

    const userOverrides = await this.userPermRepo.find({
      where: { userId: user.id },
      relations: ['permissionAction', 'permissionAction.permission'],
    });
    const overrideMap = new Map(
      userOverrides.map((o) => [o.permissionActionId, o.effect]),
    );

    const matrix = permissions.map((perm) => ({
      permission: { id: perm.id, code: perm.code, name: perm.name },
      actions: (perm.actions || []).map((action) => {
        const roleGrant = roleGrantSet.has(action.id);
        const override = overrideMap.get(action.id);
        let effective = roleGrant;
        if (override === 'DENY') effective = false;
        if (override === 'ALLOW') effective = true;
        return {
          id: action.id,
          code: action.code,
          name: action.name,
          fromRole: roleGrant,
          override: override ?? null,
          effective,
        };
      }),
    }));

    return {
      user: { id: user.id, slug: user.slug, name: user.name, email: user.email },
      role: user.role
        ? { id: user.role.id, code: user.role.code, name: user.role.name }
        : null,
      overrides: userOverrides.map((o) => ({
        id: o.id,
        permissionActionId: o.permissionActionId,
        permissionCode: `${o.permissionAction?.permission?.code}.${o.permissionAction?.code}`,
        effect: o.effect,
      })),
      matrix,
    };
  }

  /** Evaluate a user's permission against effective matrix */
  async checkPermission(idOrSlug: string, dto: CheckPermissionDto) {
    const user = await this.findOne(idOrSlug);
    return this.permissionResolver.checkUserPermission(user.id, dto.permissionActionCode);
  }
}
