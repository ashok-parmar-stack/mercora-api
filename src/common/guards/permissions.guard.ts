import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionResolverService } from '../../database/permission-resolver.service';
import { ROLES } from '../constants/roles.constants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionResolver: PermissionResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request?.user;
    if (!user?.id) {
      throw new ForbiddenException('Access denied: authenticated user required.');
    }

    if (String(user.role || '').toUpperCase() === ROLES.SUPER_ADMIN) {
      return true;
    }

    for (const permCode of requiredPermissions) {
      const result = await this.permissionResolver.checkUserPermission(user.id, permCode);
      if (!result.hasPermission) {
        throw new ForbiddenException(
          `Access denied: missing required permission (${permCode}).`,
        );
      }
    }

    return true;
  }
}
