import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionEntity, PermissionActionEntity } from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import { UpdatePermissionDto, UpdatePermissionActionDto } from '../dto';
import { FindPermissionService } from './find-permission.service';

@Injectable()
export class UpdatePermissionService {
  private readonly logger = new MercoraLogger(UpdatePermissionService.name);

  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permRepo: Repository<PermissionEntity>,
    @InjectRepository(PermissionActionEntity)
    private readonly actionRepo: Repository<PermissionActionEntity>,
    private readonly findService: FindPermissionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Update permission module attributes.
   * Debugging: If updating module details fails, debug only this method.
   */
  async update(
    idOrCode: string,
    dto: UpdatePermissionDto,
    actorId?: string,
  ): Promise<PermissionEntity> {
    const permission = await this.findService.findOne(idOrCode);
    const oldData = { ...permission };

    Object.assign(permission, dto);
    const updated = await this.permRepo.save(permission);

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE_PERMISSION_MODULE',
      module: 'PERMISSION_MANAGEMENT',
      entityType: 'PermissionEntity',
      entityId: permission.id,
      oldData,
      newData: { name: updated.name, description: updated.description },
    });

    this.logger.info(`Permission updated: ${permission.code}`, {
      permissionId: permission.id,
    });
    return updated;
  }

  /**
   * Update permission action attributes.
   * Debugging: If updating action details fails, debug only this method.
   */
  async updateAction(
    permissionIdOrCode: string,
    actionIdOrCode: string,
    dto: UpdatePermissionActionDto,
    actorId?: string,
  ): Promise<PermissionActionEntity> {
    const action = await this.findService.findOneAction(permissionIdOrCode, actionIdOrCode);
    const oldData = { ...action };

    Object.assign(action, dto);
    const updated = await this.actionRepo.save(action);

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE_PERMISSION_ACTION',
      module: 'PERMISSION_MANAGEMENT',
      entityType: 'PermissionActionEntity',
      entityId: action.id,
      oldData,
      newData: { name: updated.name, description: updated.description },
    });

    this.logger.info(`Permission action updated: ${action.code}`, { actionId: action.id });
    return updated;
  }
}
