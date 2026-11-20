import { Injectable } from '@nestjs/common';
import { DeleteOptions } from '../../common/services';
import {
  FindPermissionService,
  CreatePermissionService,
  UpdatePermissionService,
  DeletePermissionService,
} from './services';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
  CreatePermissionActionDto,
  UpdatePermissionActionDto,
} from './dto';

/**
 * PermissionsService (Facade)
 * ─────────────────────────────────────────────────────────────────────────────
 * Delegates each lifecycle operation to its own single-responsibility service:
 *   - Find operations   → find-permission.service.ts
 *   - Create operations → create-permission.service.ts
 *   - Update operations → update-permission.service.ts
 *   - Delete operations → delete-permission.service.ts (SOFT, HARD, STATUS)
 */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly findService: FindPermissionService,
    private readonly createService: CreatePermissionService,
    private readonly updateService: UpdatePermissionService,
    private readonly deleteService: DeletePermissionService,
  ) {}

  /* ── Find Operations (debug in find-permission.service.ts) ────────────────── */

  findAll() {
    return this.findService.findAll();
  }

  findOne(idOrCode: string) {
    return this.findService.findOne(idOrCode);
  }

  findActions(permissionIdOrCode: string) {
    return this.findService.findActions(permissionIdOrCode);
  }

  findOneAction(permissionIdOrCode: string, actionIdOrCode: string) {
    return this.findService.findOneAction(permissionIdOrCode, actionIdOrCode);
  }

  findAllActions() {
    return this.findService.findAllActions();
  }

  /* ── Create Operations (debug in create-permission.service.ts) ────────────── */

  create(dto: CreatePermissionDto, actorId?: string) {
    return this.createService.create(dto, actorId);
  }

  createAction(permissionIdOrCode: string, dto: CreatePermissionActionDto, actorId?: string) {
    return this.createService.createAction(permissionIdOrCode, dto, actorId);
  }

  /* ── Update Operations (debug in update-permission.service.ts) ────────────── */

  update(idOrCode: string, dto: UpdatePermissionDto, actorId?: string) {
    return this.updateService.update(idOrCode, dto, actorId);
  }

  updateAction(
    permissionIdOrCode: string,
    actionIdOrCode: string,
    dto: UpdatePermissionActionDto,
    actorId?: string,
  ) {
    return this.updateService.updateAction(permissionIdOrCode, actionIdOrCode, dto, actorId);
  }

  /* ── Delete & Restore Operations (debug in delete-permission.service.ts) ─── */

  remove(idOrCode: string, options: DeleteOptions = {}) {
    return this.deleteService.remove(idOrCode, options);
  }

  removeAction(
    permissionIdOrCode: string,
    actionIdOrCode: string,
    options: DeleteOptions = {},
  ) {
    return this.deleteService.removeAction(permissionIdOrCode, actionIdOrCode, options);
  }

  restore(idOrCode: string, actorId?: string) {
    return this.deleteService.restore(idOrCode, actorId);
  }
}
