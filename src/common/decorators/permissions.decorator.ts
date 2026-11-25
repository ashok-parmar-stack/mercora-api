import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Restricts an endpoint or controller to users granted the listed permission action codes
 * (for example: `USERS.VIEW`, `USERS.UPDATE`). `SUPER_ADMIN` bypasses granular checks.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
