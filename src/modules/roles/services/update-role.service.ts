import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { RoleEntity, RolePermissionEntity } from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import {
  UpdateRoleDto,
  UpdateRolePermissionMatrixDto,
  AddRolePermissionsDto,
  RemoveRolePermissionsDto,
} from '../dto';
import { FindRoleService } from './find-role.service';

@Injectable()
export class UpdateRoleService {
  private readonly logger = new MercoraLogger(UpdateRoleService.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermRepo: Repository<RolePermissionEntity>,
    private readonly findRoleService: FindRoleService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Update role metadata.
   * Debugging: If updating role name/description fails, debug only this method.
   */
  async update(idOrCode: string, dto: UpdateRoleDto, actorId?: string): Promise<RoleEntity> {
    const role = await this.findRoleService.findOne(idOrCode);
    const oldData = { ...role };

    Object.assign(role, dto);
    const updated = await this.roleRepo.save(role);

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE_ROLE',
      module: 'ROLE_MANAGEMENT',
      entityType: 'RoleEntity',
      entityId: role.id,
      oldData,
      newData: { name: updated.name, description: updated.description },
    });

    this.logger.info(`Role updated: ${role.code}`, { roleId: role.id });
    return updated;
  }

  /**
   * Replace the full permission matrix for a role.
   * Debugging: If matrix assignment/clearing fails, debug only this method.
   */
  async setPermissionMatrix(
    idOrCode: string,
    dto: UpdateRolePermissionMatrixDto,
    actorId?: string,
  ) {
    const role = await this.findRoleService.findOne(idOrCode);

    // Delete all existing permissions
    await this.rolePermRepo.delete({ roleId: role.id });

    // Insert new deduplicated set
    const unique = [...new Set(dto.permissionActionIds)];
    if (unique.length > 0) {
      const rows = unique.map((permissionActionId) =>
        this.rolePermRepo.create({ roleId: role.id, permissionActionId }),
      );
      await this.rolePermRepo.save(rows);
    }

    await this.audit.log({
      userId: actorId,
      action: 'SET_ROLE_PERMISSIONS',
      module: 'ROLE_MANAGEMENT',
      entityType: 'RolePermissionEntity',
      entityId: role.id,
      newData: { grantedActionIds: unique },
    });

    this.logger.info(`Updated permission matrix for role: ${role.code}`, {
      roleId: role.id,
      actionCount: unique.length,
    });

    return this.findRoleService.getPermissionMatrix(role.id);
  }

  /**
   * Incrementally add permission actions to a role.
   * Debugging: If adding action grants fails, debug only this method.
   */
  async addPermissions(idOrCode: string, dto: AddRolePermissionsDto, actorId?: string) {
    const role = await this.findRoleService.findOne(idOrCode);
    for (const permissionActionId of dto.permissionActionIds) {
      const exists = await this.rolePermRepo.findOne({
        where: { roleId: role.id, permissionActionId },
      });
      if (!exists) {
        await this.rolePermRepo.save(
          this.rolePermRepo.create({ roleId: role.id, permissionActionId }),
        );
      }
    }

    await this.audit.log({
      userId: actorId,
      action: 'ADD_ROLE_PERMISSIONS',
      module: 'ROLE_MANAGEMENT',
      entityType: 'RolePermissionEntity',
      entityId: role.id,
      newData: { addedActionIds: dto.permissionActionIds },
    });

    return this.findRoleService.getPermissionMatrix(role.id);
  }

  /**
   * Incrementally remove permission actions from a role.
   * Debugging: If removing action grants fails, debug only this method.
   */
  async removePermissions(idOrCode: string, dto: RemoveRolePermissionsDto, actorId?: string) {
    const role = await this.findRoleService.findOne(idOrCode);
    await this.rolePermRepo.delete({
      roleId: role.id,
      permissionActionId: In(dto.permissionActionIds),
    });

    await this.audit.log({
      userId: actorId,
      action: 'REMOVE_ROLE_PERMISSIONS',
      module: 'ROLE_MANAGEMENT',
      entityType: 'RolePermissionEntity',
      entityId: role.id,
      oldData: { removedActionIds: dto.permissionActionIds },
    });

    return this.findRoleService.getPermissionMatrix(role.id);
  }
}
