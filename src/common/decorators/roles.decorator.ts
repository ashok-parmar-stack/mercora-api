import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restricts an endpoint or controller to users possessing at least one of the listed role codes.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
