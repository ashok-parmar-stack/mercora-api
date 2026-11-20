/**
 * AuditService
 * ─────────────────────────────────────────────────────────────────────────────
 * Writes immutable audit trail rows to the `audit_logs` table.
 * Called from any service after a mutating operation.
 *
 * Non-fatal: any DB error during audit write is caught and only logged —
 * it never breaks the main request flow.
 *
 * Usage:
 *   constructor(private readonly audit: AuditService) {}
 *
 *   await this.audit.log({
 *     userId: actorId,
 *     action: 'CREATE_ROLE',
 *     module: 'ROLE_MANAGEMENT',
 *     entityType: 'RoleEntity',
 *     entityId: role.id,
 *     newData: role,
 *   });
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../../database/entities';
import { MercoraLogger } from '../logger';
import { MSG } from '../messages';

export interface AuditLogInput {
  /** ID of the acting user (null for system actions) */
  userId?: string;
  /** Verb in SCREAMING_SNAKE: CREATE_USER, UPDATE_ROLE_PERMISSIONS, SOFT_DELETE_USER */
  action: string;
  /** Module: USER_MANAGEMENT, ROLE_MANAGEMENT, PERMISSION_MANAGEMENT, COMPANY_MANAGEMENT */
  module: string;
  /** Entity class name: UserEntity, RoleEntity */
  entityType?: string;
  /** Primary key of the affected record */
  entityId?: string;
  /** State before the change */
  oldData?: Record<string, any>;
  /** State after the change */
  newData?: Record<string, any>;
  /** Requester IP */
  ipAddress?: string;
  /** Requester User-Agent */
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new MercoraLogger(AuditService.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private auditRepo: Repository<AuditLogEntity>,
  ) {}

  /**
   * Write an audit log entry.
   * Errors are caught and logged — never propagated.
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      const isUuid =
        input.userId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.userId);

      const entry = this.auditRepo.create({
        userId: isUuid ? input.userId : null,
        action: input.action,
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId,
        oldData: input.oldData,
        newData: input.newData,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      await this.auditRepo.save(entry);

      this.logger.audit(input.action, {
        userId: input.userId,
        module: input.module,
        entityId: input.entityId,
        detail: input.entityType,
      });
    } catch (error) {
      this.logger.error(MSG.AUDIT.LOG_FAILED(input.action), error, {
        action: input.action,
        module: input.module,
      });
    }
  }

  /**
   * Retrieve recent audit logs for the admin console.
   */
  async findAll(limit = 50): Promise<AuditLogEntity[]> {
    try {
      return await this.auditRepo.find({
        relations: ['user'],
        order: { createdAt: 'DESC' },
        take: limit,
      });
    } catch (error) {
      this.logger.error('Failed to query audit logs', error);
      return [];
    }
  }
}
