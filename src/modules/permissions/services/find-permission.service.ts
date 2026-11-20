import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionEntity, PermissionActionEntity } from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { MSG } from '../../../common/messages';
import { BaseEntityService } from '../../../common/services';
import { AuditService } from '../../../common/audit';

@Injectable()
export class FindPermissionService extends BaseEntityService<PermissionEntity> {
  protected readonly entityName = 'Permission';
  protected readonly logger = new MercoraLogger(FindPermissionService.name);

  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permRepo: Repository<PermissionEntity>,
    @InjectRepository(PermissionActionEntity)
    private readonly actionRepo: Repository<PermissionActionEntity>,
    protected readonly audit: AuditService,
  ) {
    super(permRepo);
  }

  /** List all permissions with their actions and statuses */
  findAll(): Promise<PermissionEntity[]> {
    this.logger.debug('Fetching all permissions list with actions');
    return this.permRepo.find({
      relations: ['actions', 'status'],
      order: { name: 'ASC' },
    });
  }

  /** Get single permission by UUID or Code (e.g. COMPANIES, USERS) */
  async findOne(idOrCode: string): Promise<PermissionEntity> {
    this.logger.debug('Finding permission module', { idOrCode });
    return this.findByIdOrSlug(idOrCode, 'code', {
      relations: ['actions', 'status'],
    });
  }

  /** List all actions for a permission module */
  async findActions(permissionIdOrCode: string): Promise<PermissionActionEntity[]> {
    const permission = await this.findOne(permissionIdOrCode);
    return this.actionRepo.find({
      where: { permissionId: permission.id },
      relations: ['status'],
      order: { code: 'ASC' },
    });
  }

  /** Find a specific action under a permission */
  async findOneAction(
    permissionIdOrCode: string,
    actionIdOrCode: string,
  ): Promise<PermissionActionEntity> {
    const permission = await this.findOne(permissionIdOrCode);
    const isActionUUID = this.isUUID(actionIdOrCode);

    const action = await this.actionRepo.findOne({
      where: isActionUUID
        ? { id: actionIdOrCode, permissionId: permission.id }
        : { code: actionIdOrCode, permissionId: permission.id },
      relations: ['status', 'permission'],
    });

    if (!action) {
      this.logger.warn('Permission action not found', {
        permissionId: permission.id,
        actionIdOrCode,
      });
      throw new NotFoundException(MSG.PERMISSION_ACTION.NOT_FOUND(actionIdOrCode));
    }

    return action;
  }

  /** Flat list of all actions across all permissions */
  findAllActions(): Promise<PermissionActionEntity[]> {
    this.logger.debug('Fetching flat list of all permission actions');
    return this.actionRepo.find({
      relations: ['permission', 'status'],
      order: { permissionId: 'ASC', code: 'ASC' },
    });
  }
}
