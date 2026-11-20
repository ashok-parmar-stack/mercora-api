import { Injectable } from '@nestjs/common';
import { DeleteOptions } from '../../common/services';
import {
  FindRoleService,
  CreateRoleService,
  UpdateRoleService,
  DeleteRoleService,
} from './services';
import {
  CreateRoleDto,
  UpdateRoleDto,
  UpdateRolePermissionMatrixDto,
  AddRolePermissionsDto,
  RemoveRolePermissionsDto,
} from './dto';

/**
 * RolesService (Facade)
 * ─────────────────────────────────────────────────────────────────────────────
 * Delegates each role lifecycle operation to its own single-responsibility service:
 *   - Find & Permission Matrix → find-role.service.ts
 *   - Create operations        → create-role.service.ts
 *   - Update & Matrix edits    → update-role.service.ts
 *   - Delete operations        → delete-role.service.ts (SOFT, HARD, STATUS)
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly findService: FindRoleService,
    private readonly createService: CreateRoleService,
    private readonly updateService: UpdateRoleService,
    private readonly deleteService: DeleteRoleService,
  ) {}

  /* ── Find Operations (debug in find-role.service.ts) ─────────────────────── */

  findAll() {
    return this.findService.findAll();
  }

  findOne(idOrCode: string) {
    return this.findService.findOne(idOrCode);
  }

  getPermissionMatrix(idOrCode: string) {
    return this.findService.getPermissionMatrix(idOrCode);
  }

  /* ── Create Operations (debug in create-role.service.ts) ─────────────────── */

  create(dto: CreateRoleDto, actorId?: string) {
    return this.createService.create(dto, actorId);
  }

  /* ── Update Operations (debug in update-role.service.ts) ─────────────────── */

  update(idOrCode: string, dto: UpdateRoleDto, actorId?: string) {
    return this.updateService.update(idOrCode, dto, actorId);
  }

  setPermissionMatrix(
    idOrCode: string,
    dto: UpdateRolePermissionMatrixDto,
    actorId?: string,
  ) {
    return this.updateService.setPermissionMatrix(idOrCode, dto, actorId);
  }

  addPermissions(idOrCode: string, dto: AddRolePermissionsDto, actorId?: string) {
    return this.updateService.addPermissions(idOrCode, dto, actorId);
  }

  removePermissions(idOrCode: string, dto: RemoveRolePermissionsDto, actorId?: string) {
    return this.updateService.removePermissions(idOrCode, dto, actorId);
  }

  /* ── Delete & Restore Operations (debug in delete-role.service.ts) ───────── */

  remove(idOrCode: string, options: DeleteOptions = {}) {
    return this.deleteService.remove(idOrCode, options);
  }

  restore(idOrCode: string, actorId?: string) {
    return this.deleteService.restore(idOrCode, actorId);
  }
}
