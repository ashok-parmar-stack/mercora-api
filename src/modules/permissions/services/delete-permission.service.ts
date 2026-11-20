import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PermissionEntity,
  PermissionActionEntity,
  StatusEntity,
} from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import { MSG } from '../../../common/messages';
import { DeleteOptions } from '../../../common/services';
import { FindPermissionService } from './find-permission.service';

@Injectable()
export class DeletePermissionService {
  private readonly logger = new MercoraLogger(DeletePermissionService.name);

  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permRepo: Repository<PermissionEntity>,
    @InjectRepository(PermissionActionEntity)
    private readonly actionRepo: Repository<PermissionActionEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    private readonly findService: FindPermissionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Safe Soft Delete with Status Management for Permission Module.
   * 1. Updates status to 'INACTIVE'
   * 2. Soft-deletes record (`deleted_at = NOW()`)
   * 3. Logs immutable audit trail
   */
  async remove(
    idOrCode: string,
    options: DeleteOptions = {},
  ): Promise<{ message: string; mode: string; status: string }> {
    const permission = await this.findService.findOne(idOrCode);
    const previousStatusId = permission.statusId;

    // Find 'INACTIVE' status for Permission entity
    let targetStatusId = options.statusId;
    if (!targetStatusId) {
      const inactiveStatus = await this.statusRepo.findOne({
        where: { type: 'PERMISSION', code: 'INACTIVE' },
      });
      targetStatusId = inactiveStatus?.id;
    }

    if (targetStatusId) {
      permission.statusId = targetStatusId;
      await this.permRepo.save(permission);
    }

    // Perform soft delete
    await this.permRepo.softDelete(permission.id);

    // Immutable audit trail
    await this.audit.log({
      userId: options.actorId,
      action: 'SOFT_DELETE_PERMISSION_MODULE',
      module: 'PERMISSION_MANAGEMENT',
      entityType: 'PermissionEntity',
      entityId: permission.id,
      oldData: {
        id: permission.id,
        code: permission.code,
        name: permission.name,
        statusId: previousStatusId,
        reason: options.reason,
      },
      newData: {
        statusId: permission.statusId,
        deletedAt: new Date(),
        reason: options.reason,
      },
    });

    this.logger.info(`Permission soft-deleted & marked INACTIVE: ${permission.code}`, {
      permissionId: permission.id,
      statusId: permission.statusId,
      reason: options.reason,
    });

    return {
      message: MSG.PERMISSION.DELETED('SOFT'),
      mode: 'SOFT_DELETE',
      status: 'INACTIVE',
    };
  }

  /**
   * Safe Soft Delete with Status Management for Permission Action.
   */
  async removeAction(
    permissionIdOrCode: string,
    actionIdOrCode: string,
    options: DeleteOptions = {},
  ): Promise<{ message: string; mode: string; status: string }> {
    const action = await this.findService.findOneAction(permissionIdOrCode, actionIdOrCode);
    const previousStatusId = action.statusId;

    let targetStatusId = options.statusId;
    if (!targetStatusId) {
      const inactiveStatus = await this.statusRepo.findOne({
        where: { type: 'PERMISSION', code: 'INACTIVE' },
      });
      targetStatusId = inactiveStatus?.id;
    }

    if (targetStatusId) {
      action.statusId = targetStatusId;
      await this.actionRepo.save(action);
    }

    // Perform soft delete
    await this.actionRepo.softDelete(action.id);

    await this.audit.log({
      userId: options.actorId,
      action: 'SOFT_DELETE_PERMISSION_ACTION',
      module: 'PERMISSION_MANAGEMENT',
      entityType: 'PermissionActionEntity',
      entityId: action.id,
      oldData: {
        id: action.id,
        code: action.code,
        name: action.name,
        statusId: previousStatusId,
        reason: options.reason,
      },
      newData: {
        statusId: action.statusId,
        deletedAt: new Date(),
        reason: options.reason,
      },
    });

    this.logger.info(`Permission action soft-deleted & marked INACTIVE: ${action.code}`, {
      actionId: action.id,
      statusId: action.statusId,
    });

    return {
      message: MSG.PERMISSION_ACTION.DELETED('SOFT'),
      mode: 'SOFT_DELETE',
      status: 'INACTIVE',
    };
  }

  /**
   * Restore a soft-deleted permission module and reset status back to 'ACTIVE'.
   */
  async restore(idOrCode: string, actorId?: string): Promise<{ message: string; status: string }> {
    const permission = await this.findService.findByIdOrSlug(idOrCode, 'code', {
      withDeleted: true,
    });

    const activeStatus = await this.statusRepo.findOne({
      where: { type: 'PERMISSION', code: 'ACTIVE' },
    });

    if (activeStatus) {
      permission.statusId = activeStatus.id;
      await this.permRepo.save(permission);
    }

    await this.permRepo.restore(permission.id);

    await this.audit.log({
      userId: actorId,
      action: 'RESTORE_PERMISSION_MODULE',
      module: 'PERMISSION_MANAGEMENT',
      entityType: 'PermissionEntity',
      entityId: permission.id,
      newData: { id: permission.id, code: permission.code, statusId: permission.statusId },
    });

    this.logger.info(`Permission restored & marked ACTIVE: ${permission.code}`, {
      permissionId: permission.id,
      statusId: permission.statusId,
    });

    return {
      message: MSG.PERMISSION.RESTORED,
      status: 'ACTIVE',
    };
  }
}
