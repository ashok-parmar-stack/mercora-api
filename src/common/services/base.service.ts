import {
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Repository, ObjectLiteral, FindOptionsWhere, FindOneOptions } from 'typeorm';
import { MercoraLogger } from '../logger';
import { AuditService, AuditLogInput } from '../audit/audit.service';
import { MSG } from '../messages';
import { toSlug, toUniqueSlug } from './slug.util';

import { UUID_REGEX, isUUID } from '../constants';

export { UUID_REGEX };

export type DeleteMode = 'SOFT' | 'HARD' | 'STATUS';

export interface DeleteOptions {
  /**
   * 'SOFT'   → soft delete (`deleted_at` timestamp), recoverable
   * 'HARD'   → physical permanent table removal
   * 'STATUS' → status updated to INACTIVE or custom statusId
   */
  mode?: DeleteMode;
  reason?: string;
  statusId?: string;
  actorId?: string;
}

export interface CommonFindOptions<T> {
  relations?: string[];
  select?: (keyof T)[];
  withDeleted?: boolean;
}

/**
 * BaseEntityService
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralizes common entity operations:
 * - Slug / UUID resolution (user-side sees slug, backend resolves seamlessly)
 * - Centralized exception handling with MSG tokens
 * - Automated debug & audit tracing for full observability
 */
export abstract class BaseEntityService<T extends ObjectLiteral> {
  protected abstract readonly entityName: string;
  protected abstract readonly logger: MercoraLogger;
  protected abstract readonly audit: AuditService;

  constructor(protected readonly repository: Repository<T>) {}

  /** Check if a string is a valid UUID */
  protected isUUID(value: string): boolean {
    return Boolean(value && UUID_REGEX.test(value));
  }

  /**
   * Find an entity by either UUID or Slug/Code.
   * If input matches UUID format, queries `id`. Otherwise queries `slug` (or custom field like `code`).
   */
  async findByIdOrSlug(
    idOrSlug: string,
    slugField: keyof T = 'slug' as keyof T,
    options: CommonFindOptions<T> = {},
  ): Promise<T> {
    const isId = this.isUUID(idOrSlug);
    const whereCondition = (isId
      ? { id: idOrSlug }
      : { [slugField]: idOrSlug }) as FindOptionsWhere<T>;

    const findOptions: FindOneOptions<T> = {
      where: whereCondition,
      relations: options.relations,
      withDeleted: options.withDeleted ?? false,
    };

    const entity = await this.repository.findOne(findOptions);

    if (!entity) {
      this.logger.warn(`${this.entityName} lookup failed`, { idOrSlug, isId });
      throw new NotFoundException(MSG.NOT_FOUND_BY_IDENTIFIER(this.entityName, idOrSlug));
    }

    return entity;
  }

  /**
   * Ensure that a given field value is not already taken by another record.
   */
  async ensureUnique(
    field: keyof T,
    value: any,
    excludeId?: string,
  ): Promise<void> {
    if (!value) return;

    const query = this.repository
      .createQueryBuilder('entity')
      .where(`entity.${String(field)} = :value`, { value });

    if (excludeId) {
      query.andWhere('entity.id != :excludeId', { excludeId });
    }

    const exists = await query.getOne();
    if (exists) {
      this.logger.warn(`Duplicate check failed for ${this.entityName}`, {
        field: String(field),
        value,
      });
      throw new ConflictException(
        MSG.ALREADY_EXISTS(this.entityName, String(field), String(value)),
      );
    }
  }

  /**
   * Generate a unique slug for this entity table.
   */
  async generateUniqueSlug(
    baseValue: string,
    slugField: keyof T = 'slug' as keyof T,
  ): Promise<string> {
    const cleanBase = toSlug(baseValue || '') || 'item';
    const existing = await this.repository.findOne({
      where: { [slugField]: cleanBase } as FindOptionsWhere<T>,
    });

    if (!existing) {
      return cleanBase;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = toUniqueSlug(cleanBase);
      const collision = await this.repository.findOne({
        where: { [slugField]: candidate } as FindOptionsWhere<T>,
      });
      if (!collision) {
        return candidate;
      }
    }

    return `${cleanBase}-${Date.now().toString(36)}`;
  }

  /**
   * Safely log an audit entry and debug telemetry.
   */
  protected async recordAudit(input: AuditLogInput): Promise<void> {
    await this.audit.log(input);
  }
}
