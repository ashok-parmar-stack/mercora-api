import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserEntity,
  RolePermissionEntity,
  UserPermissionEntity,
  PermissionActionEntity,
} from './entities';

export interface EffectivePermissionCheckResult {
  hasPermission: boolean;
  resolvedBy: 'USER_DENY' | 'USER_ALLOW' | 'ROLE_PERMISSION' | 'SUPER_ADMIN' | 'DEFAULT_DENY';
  permissionActionCode: string;
}

@Injectable()
export class PermissionResolverService {
  constructor(
    @InjectRepository(UserEntity) private userRepo: Repository<UserEntity>,
    @InjectRepository(RolePermissionEntity) private rolePermRepo: Repository<RolePermissionEntity>,
    @InjectRepository(UserPermissionEntity) private userPermRepo: Repository<UserPermissionEntity>,
    @InjectRepository(PermissionActionEntity) private actionRepo: Repository<PermissionActionEntity>,
  ) {}

  /**
   * Evaluates if a user has permission to execute an action using the prioritized algorithm:
   * 1. Super Admin bypass (Protected system role)
   * 2. User DENY override  -> Returns false
   * 3. User ALLOW override -> Returns true
   * 4. Role permission     -> Returns true if mapped to user's role
   * 5. Default DENY        -> Returns false
   * 
   * @param userId UUID of the user
   * @param permissionActionFullCode e.g. "COMPANIES.EXPORT", "USERS.DELETE"
   */
  async checkUserPermission(
    userId: string,
    permissionActionFullCode: string,
  ): Promise<EffectivePermissionCheckResult> {
    const [permCode, actCode] = permissionActionFullCode.split('.');

    // Find the permission action entity
    const action = await this.actionRepo
      .createQueryBuilder('action')
      .innerJoin('action.permission', 'perm')
      .where('perm.code = :permCode AND action.code = :actCode', { permCode, actCode })
      .getOne();

    if (!action) {
      return {
        hasPermission: false,
        resolvedBy: 'DEFAULT_DENY',
        permissionActionCode: permissionActionFullCode,
      };
    }

    // Load user with role
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['role'],
    });

    if (!user) {
      return {
        hasPermission: false,
        resolvedBy: 'DEFAULT_DENY',
        permissionActionCode: permissionActionFullCode,
      };
    }

    // 1. Super Admin bypass
    if (user.role?.code === 'SUPER_ADMIN') {
      return {
        hasPermission: true,
        resolvedBy: 'SUPER_ADMIN',
        permissionActionCode: permissionActionFullCode,
      };
    }

    // 2 & 3. Check User-specific Overrides (DENY > ALLOW)
    const userOverride = await this.userPermRepo.findOne({
      where: { userId, permissionActionId: action.id },
    });

    if (userOverride) {
      if (userOverride.effect === 'DENY') {
        return {
          hasPermission: false,
          resolvedBy: 'USER_DENY',
          permissionActionCode: permissionActionFullCode,
        };
      }
      if (userOverride.effect === 'ALLOW') {
        return {
          hasPermission: true,
          resolvedBy: 'USER_ALLOW',
          permissionActionCode: permissionActionFullCode,
        };
      }
    }

    // 4. Check Role Permissions
    if (user.roleId) {
      const hasRolePermission = await this.rolePermRepo.findOne({
        where: { roleId: user.roleId, permissionActionId: action.id },
      });

      if (hasRolePermission) {
        return {
          hasPermission: true,
          resolvedBy: 'ROLE_PERMISSION',
          permissionActionCode: permissionActionFullCode,
        };
      }
    }

    // 5. Default Deny
    return {
      hasPermission: false,
      resolvedBy: 'DEFAULT_DENY',
      permissionActionCode: permissionActionFullCode,
    };
  }
}
