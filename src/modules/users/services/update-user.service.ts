import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserPermissionEntity } from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import {
  UpdateUserDto,
  AssignRoleDto,
  SetUserPermissionsDto,
  AddUserPermissionDto,
  RemoveUserPermissionDto,
} from '../dto';
import { FindUserService } from './find-user.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UpdateUserService {
  private readonly logger = new MercoraLogger(UpdateUserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserPermissionEntity)
    private readonly userPermRepo: Repository<UserPermissionEntity>,
    private readonly findUserService: FindUserService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Update user details by ID or Slug.
   * Debugging: If user profile edits or slug updates fail, debug only this method.
   */
  async update(idOrSlug: string, dto: UpdateUserDto, actorId?: string): Promise<UserEntity> {
    const user = await this.findUserService.findOne(idOrSlug);
    const oldData = { ...user };

    if (dto.slug && dto.slug !== user.slug) {
      await this.findUserService.ensureUnique('slug', dto.slug, user.id);
    }

    if (
      (dto as any).password &&
      !(dto as any).password.startsWith('$2b$') &&
      !(dto as any).password.startsWith('$2a$') &&
      !(dto as any).password.startsWith('$2y$')
    ) {
      (dto as any).password = await bcrypt.hash((dto as any).password, 12);
    }

    Object.assign(user, dto);
    const updatedUser = await this.userRepo.save(user);

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE_USER',
      module: 'USER_MANAGEMENT',
      entityType: 'UserEntity',
      entityId: user.id,
      oldData,
      newData: { name: updatedUser.name, slug: updatedUser.slug, roleId: updatedUser.roleId },
    });

    this.logger.info(`User updated: ${user.email} (slug: ${user.slug})`, {
      userId: user.id,
      slug: user.slug,
    });

    return updatedUser;
  }

  /**
   * Assign or change a user's role.
   * Debugging: If role assignment to user fails, debug only this method.
   */
  async assignRole(idOrSlug: string, dto: AssignRoleDto, actorId?: string): Promise<UserEntity> {
    const user = await this.findUserService.findOne(idOrSlug);
    const previousRoleId = user.roleId;
    user.roleId = dto.roleId;
    const updated = await this.userRepo.save(user);

    await this.audit.log({
      userId: actorId,
      action: 'ASSIGN_ROLE_TO_USER',
      module: 'USER_MANAGEMENT',
      entityType: 'UserEntity',
      entityId: user.id,
      oldData: { roleId: previousRoleId },
      newData: { roleId: dto.roleId },
    });

    this.logger.info(`Role assigned to user: ${user.email}`, {
      userId: user.id,
      newRoleId: dto.roleId,
      previousRoleId,
    });

    return updated;
  }

  /**
   * Replace all user-specific permission overrides.
   * Debugging: If setting user overrides fails, debug only this method.
   */
  async setUserPermissions(idOrSlug: string, dto: SetUserPermissionsDto, actorId?: string) {
    const user = await this.findUserService.findOne(idOrSlug);
    await this.userPermRepo.delete({ userId: user.id });

    if (dto.overrides.length > 0) {
      const rows = dto.overrides.map((o) =>
        this.userPermRepo.create({
          userId: user.id,
          permissionActionId: o.permissionActionId,
          effect: o.effect,
        }),
      );
      await this.userPermRepo.save(rows);
    }

    await this.audit.log({
      userId: actorId,
      action: 'SET_USER_PERMISSIONS',
      module: 'USER_MANAGEMENT',
      entityType: 'UserPermissionEntity',
      entityId: user.id,
      newData: { overrides: dto.overrides },
    });

    return this.findUserService.getPermissionPanel(user.id);
  }

  /**
   * Add or update a single user-level override.
   * Debugging: If adding an override fails, debug only this method.
   */
  async addUserPermission(idOrSlug: string, dto: AddUserPermissionDto, actorId?: string) {
    const user = await this.findUserService.findOne(idOrSlug);
    const existing = await this.userPermRepo.findOne({
      where: { userId: user.id, permissionActionId: dto.permissionActionId },
    });

    if (existing) {
      existing.effect = dto.effect;
      await this.userPermRepo.save(existing);
    } else {
      await this.userPermRepo.save(
        this.userPermRepo.create({
          userId: user.id,
          permissionActionId: dto.permissionActionId,
          effect: dto.effect,
        }),
      );
    }

    await this.audit.log({
      userId: actorId,
      action: 'ADD_USER_PERMISSION_OVERRIDE',
      module: 'USER_MANAGEMENT',
      entityType: 'UserPermissionEntity',
      entityId: user.id,
      newData: { permissionActionId: dto.permissionActionId, effect: dto.effect },
    });

    return this.findUserService.getPermissionPanel(user.id);
  }

  /**
   * Remove specific user-level overrides.
   * Debugging: If deleting an override fails, debug only this method.
   */
  async removeUserPermissions(
    idOrSlug: string,
    dto: RemoveUserPermissionDto,
    actorId?: string,
  ) {
    const user = await this.findUserService.findOne(idOrSlug);
    for (const permissionActionId of dto.permissionActionIds) {
      await this.userPermRepo.delete({ userId: user.id, permissionActionId });
    }

    await this.audit.log({
      userId: actorId,
      action: 'REMOVE_USER_PERMISSION_OVERRIDE',
      module: 'USER_MANAGEMENT',
      entityType: 'UserPermissionEntity',
      entityId: user.id,
      oldData: { removedActionIds: dto.permissionActionIds },
    });

    return this.findUserService.getPermissionPanel(user.id);
  }
}
