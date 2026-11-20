import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, StatusEntity } from '../../../database/entities';
import { MercoraLogger } from '../../../common/logger';
import { AuditService } from '../../../common/audit';
import { MSG } from '../../../common/messages';
import { DeleteOptions } from '../../../common/services';
import { FindUserService } from './find-user.service';

@Injectable()
export class DeleteUserService {
  private readonly logger = new MercoraLogger(DeleteUserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(StatusEntity)
    private readonly statusRepo: Repository<StatusEntity>,
    private readonly findUserService: FindUserService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Safe Soft Delete with Status Management.
   * 1. Updates status to 'INACTIVE' (or custom statusId if provided)
   * 2. Soft-deletes record (`deleted_at = NOW()`), preventing physical data loss
   * 3. Records complete audit trail
   */
  async remove(
    idOrSlug: string,
    options: DeleteOptions = {},
  ): Promise<{ message: string; mode: string; status: string }> {
    const user = await this.findUserService.findOne(idOrSlug);
    const previousStatusId = user.statusId;

    // Find 'INACTIVE' status for User entity
    let targetStatusId = options.statusId;
    if (!targetStatusId) {
      const inactiveStatus = await this.statusRepo.findOne({
        where: { type: 'USER', code: 'INACTIVE' },
      });
      targetStatusId = inactiveStatus?.id;
    }

    if (targetStatusId) {
      user.statusId = targetStatusId;
      await this.userRepo.save(user);
    }

    // Perform soft delete
    await this.userRepo.softDelete(user.id);

    // Immutable audit trail
    await this.audit.log({
      userId: options.actorId,
      action: 'SOFT_DELETE_USER',
      module: 'USER_MANAGEMENT',
      entityType: 'UserEntity',
      entityId: user.id,
      oldData: {
        id: user.id,
        email: user.email,
        slug: user.slug,
        statusId: previousStatusId,
        reason: options.reason,
      },
      newData: {
        statusId: user.statusId,
        deletedAt: new Date(),
        reason: options.reason,
      },
    });

    this.logger.info(`User soft-deleted & marked INACTIVE: ${user.email} (slug: ${user.slug})`, {
      userId: user.id,
      statusId: user.statusId,
      reason: options.reason,
    });

    return {
      message: MSG.USER.DELETED('SOFT'),
      mode: 'SOFT_DELETE',
      status: 'INACTIVE',
    };
  }

  /**
   * Restore a soft-deleted user and reset status back to 'ACTIVE'.
   */
  async restore(idOrSlug: string, actorId?: string): Promise<{ message: string; status: string }> {
    const user = await this.findUserService.findByIdOrSlug(idOrSlug, 'slug', {
      withDeleted: true,
    });

    // Find 'ACTIVE' status for User entity
    const activeStatus = await this.statusRepo.findOne({
      where: { type: 'USER', code: 'ACTIVE' },
    });

    if (activeStatus) {
      user.statusId = activeStatus.id;
      await this.userRepo.save(user);
    }

    await this.userRepo.restore(user.id);

    await this.audit.log({
      userId: actorId,
      action: 'RESTORE_USER',
      module: 'USER_MANAGEMENT',
      entityType: 'UserEntity',
      entityId: user.id,
      newData: { id: user.id, email: user.email, statusId: user.statusId },
    });

    this.logger.info(`User restored & marked ACTIVE: ${user.email}`, {
      userId: user.id,
      statusId: user.statusId,
    });

    return {
      message: MSG.USER.RESTORED,
      status: 'ACTIVE',
    };
  }
}
