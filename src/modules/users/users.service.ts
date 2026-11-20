import { Injectable } from '@nestjs/common';
import { DeleteOptions } from '../../common/services';
import {
  FindUserService,
  CreateUserService,
  UpdateUserService,
  DeleteUserService,
} from './services';
import {
  CreateUserDto,
  UpdateUserDto,
  AssignRoleDto,
  SetUserPermissionsDto,
  AddUserPermissionDto,
  RemoveUserPermissionDto,
  CheckPermissionDto,
} from './dto';

/**
 * UsersService (Facade)
 * ─────────────────────────────────────────────────────────────────────────────
 * Delegates each user lifecycle operation to its own single-responsibility service:
 *   - Find & Permission matrix  → find-user.service.ts
 *   - Create & Slug generation  → create-user.service.ts
 *   - Update & Role assignments → update-user.service.ts
 *   - Delete & Audit logging    → delete-user.service.ts (SOFT, HARD, STATUS)
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly findService: FindUserService,
    private readonly createService: CreateUserService,
    private readonly updateService: UpdateUserService,
    private readonly deleteService: DeleteUserService,
  ) {}

  /* ── Find Operations (debug in find-user.service.ts) ─────────────────────── */

  findAll(query?: any) {
    return this.findService.findAll(query);
  }

  findOne(idOrSlug: string) {
    return this.findService.findOne(idOrSlug);
  }

  getPermissionPanel(idOrSlug: string) {
    return this.findService.getPermissionPanel(idOrSlug);
  }

  checkPermission(idOrSlug: string, dto: CheckPermissionDto) {
    return this.findService.checkPermission(idOrSlug, dto);
  }

  /* ── Create Operations (debug in create-user.service.ts) ─────────────────── */

  create(dto: CreateUserDto, actorId?: string) {
    return this.createService.create(dto, actorId);
  }

  /* ── Update Operations (debug in update-user.service.ts) ─────────────────── */

  update(idOrSlug: string, dto: UpdateUserDto, actorId?: string) {
    return this.updateService.update(idOrSlug, dto, actorId);
  }

  assignRole(idOrSlug: string, dto: AssignRoleDto, actorId?: string) {
    return this.updateService.assignRole(idOrSlug, dto, actorId);
  }

  setUserPermissions(idOrSlug: string, dto: SetUserPermissionsDto, actorId?: string) {
    return this.updateService.setUserPermissions(idOrSlug, dto, actorId);
  }

  addUserPermission(idOrSlug: string, dto: AddUserPermissionDto, actorId?: string) {
    return this.updateService.addUserPermission(idOrSlug, dto, actorId);
  }

  removeUserPermissions(idOrSlug: string, dto: RemoveUserPermissionDto, actorId?: string) {
    return this.updateService.removeUserPermissions(idOrSlug, dto, actorId);
  }

  /* ── Delete & Restore Operations (debug in delete-user.service.ts) ────────── */

  remove(idOrSlug: string, options: DeleteOptions = {}) {
    return this.deleteService.remove(idOrSlug, options);
  }

  restore(idOrSlug: string, actorId?: string) {
    return this.deleteService.restore(idOrSlug, actorId);
  }
}
