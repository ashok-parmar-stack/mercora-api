import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity, StatusEntity } from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import { MSG } from '../../../common/messages';
import { DeleteOptions } from '../../../common/services';
import { FindRoleService } from './find-role.service';

@Injectable()
export class DeleteRoleService {
  private readonly logger = new MercoraLogger(DeleteRoleService.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    private readonly findRoleService: FindRoleService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Safe Soft Delete with Status Management.
   * 1. Protects system-defined roles from deletion
   * 2. Updates status to 'INACTIVE'
   * 3. Soft-deletes record (`deleted_at = NOW()`)
   * 4. Logs immutable audit trail
   */
  async remove(
    idOrCode: string,
    options: DeleteOptions = {},
  ): Promise<{ message: string; mode: string; status: string }> {
    const role = await this.findRoleService.findOne(idOrCode);

    if (role.isSystem) {
      this.logger.warn(`Blocked deletion of protected system role: ${role.code}`);
      throw new ForbiddenException(MSG.ROLE.SYSTEM_DELETE);
    }

    const previousStatusId = role.statusId;

    // Find 'INACTIVE' status for Role entity
    let targetStatusId = options.statusId;
    if (!targetStatusId) {
      const inactiveStatus = await this.statusRepo.findOne({
        where: { type: 'ROLE', code: 'INACTIVE' },
      });
      targetStatusId = inactiveStatus?.id;
    }

    if (targetStatusId) {
      role.statusId = targetStatusId;
      await this.roleRepo.save(role);
    }

    // Perform soft delete
    await this.roleRepo.softDelete(role.id);

    // Immutable audit trail
    await this.audit.log({
      userId: options.actorId,
      action: 'SOFT_DELETE_ROLE',
      module: 'ROLE_MANAGEMENT',
      entityType: 'RoleEntity',
      entityId: role.id,
      oldData: {
        id: role.id,
        code: role.code,
        name: role.name,
        statusId: previousStatusId,
        reason: options.reason,
      },
      newData: {
        statusId: role.statusId,
        deletedAt: new Date(),
        reason: options.reason,
      },
    });

    this.logger.info(`Role soft-deleted & marked INACTIVE: ${role.code}`, {
      roleId: role.id,
      statusId: role.statusId,
      reason: options.reason,
    });

    return {
      message: MSG.ROLE.DELETED('SOFT'),
      mode: 'SOFT_DELETE',
      status: 'INACTIVE',
    };
  }

  /**
   * Restore a soft-deleted role and reset status back to 'ACTIVE'.
   */
  async restore(idOrCode: string, actorId?: string): Promise<{ message: string; status: string }> {
    const role = await this.findRoleService.findByIdOrSlug(idOrCode, 'code', {
      withDeleted: true,
    });

    // Find 'ACTIVE' status for Role entity
    const activeStatus = await this.statusRepo.findOne({
      where: { type: 'ROLE', code: 'ACTIVE' },
    });

    if (activeStatus) {
      role.statusId = activeStatus.id;
      await this.roleRepo.save(role);
    }

    await this.roleRepo.restore(role.id);

    await this.audit.log({
      userId: actorId,
      action: 'RESTORE_ROLE',
      module: 'ROLE_MANAGEMENT',
      entityType: 'RoleEntity',
      entityId: role.id,
      newData: { id: role.id, code: role.code, statusId: role.statusId },
    });

    this.logger.info(`Role restored & marked ACTIVE: ${role.code}`, {
      roleId: role.id,
      statusId: role.statusId,
    });

    return {
      message: MSG.ROLE.RESTORED,
      status: 'ACTIVE',
    };
  }
}
