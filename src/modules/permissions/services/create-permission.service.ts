import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionEntity, PermissionActionEntity } from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import { MSG } from '../../../common/messages';
import { BaseEntityService } from '../../../common/services';
import { CreatePermissionDto, CreatePermissionActionDto } from '../dto';
import { FindPermissionService } from './find-permission.service';

@Injectable()
export class CreatePermissionService extends BaseEntityService<PermissionEntity> {
  protected readonly entityName = 'Permission';
  protected readonly logger = new MercoraLogger(CreatePermissionService.name);

  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permRepo: Repository<PermissionEntity>,
    @InjectRepository(PermissionActionEntity)
    private readonly actionRepo: Repository<PermissionActionEntity>,
    private readonly findService: FindPermissionService,
    protected readonly audit: AuditService,
  ) {
    super(permRepo);
  }

  /**
   * Create a new permission module.
   * Debugging: If permission creation fails or duplicates, debug only this method.
   */
  async create(dto: CreatePermissionDto, actorId?: string): Promise<PermissionEntity> {
    this.logger.debug('Creating permission module', { code: dto.code, name: dto.name });
    await this.ensureUnique('code', dto.code);

    const permission = this.permRepo.create(dto);
    const saved = await this.permRepo.save(permission);

    await this.recordAudit({
      userId: actorId,
      action: 'CREATE_PERMISSION_MODULE',
      module: 'PERMISSION_MANAGEMENT',
      entityType: 'PermissionEntity',
      entityId: saved.id,
      newData: { code: saved.code, name: saved.name },
    });

    this.logger.info(`Permission module created successfully: ${saved.code}`, {
      permissionId: saved.id,
    });
    return saved;
  }

  /**
   * Create a permission action under a module.
   * Debugging: If action creation or action code duplicate check fails, debug only this method.
   */
  async createAction(
    permissionIdOrCode: string,
    dto: CreatePermissionActionDto,
    actorId?: string,
  ): Promise<PermissionActionEntity> {
    const permission = await this.findService.findOne(permissionIdOrCode);

    const existing = await this.actionRepo.findOne({
      where: { permissionId: permission.id, code: dto.code },
    });
    if (existing) {
      this.logger.warn('Action code collision', {
        permissionCode: permission.code,
        actionCode: dto.code,
      });
      throw new ConflictException(MSG.PERMISSION_ACTION.CODE_EXISTS(dto.code));
    }

    const action = this.actionRepo.create({ ...dto, permissionId: permission.id });
    const saved = await this.actionRepo.save(action);

    await this.recordAudit({
      userId: actorId,
      action: 'CREATE_PERMISSION_ACTION',
      module: 'PERMISSION_MANAGEMENT',
      entityType: 'PermissionActionEntity',
      entityId: saved.id,
      newData: {
        permissionCode: permission.code,
        actionCode: saved.code,
        name: saved.name,
      },
    });

    this.logger.info(`Permission action created: ${permission.code}.${saved.code}`, {
      actionId: saved.id,
    });
    return saved;
  }
}
