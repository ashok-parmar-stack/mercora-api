/**
 * APP_MESSAGES (MSG)
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all API response and validation messages.
 * Centralized config: Change here → updates dynamically everywhere across the app.
 */

export const MSG = {
  /* ── Validation Messages ─────────────────────────────────────────────────── */
  VALIDATION: {
    REQUIRED: (field: string) => `${field} is required`,
    INVALID_EMAIL: 'Please provide a valid email address',
    INVALID_UUID: (field: string) => `${field} must be a valid UUID`,
    STRING: (field: string) => `${field} must be a string`,
    BOOLEAN: (field: string) => `${field} must be a boolean value`,
    NUMBER: (field: string) => `${field} must be a number`,
    ARRAY: (field: string) => `${field} must be an array`,
    MIN_LENGTH: (field: string, min: number) => `${field} must be at least ${min} characters`,
    MAX_LENGTH: (field: string, max: number) => `${field} must not exceed ${max} characters`,
    ENUM: (field: string, values: readonly string[] | string[]) =>
      `${field} must be one of: ${values.join(', ')}`,
    INVALID_SLUG: 'Slug must contain only lowercase letters, numbers, and hyphens',
    INVALID_PHONE: 'Please provide a valid phone number',
  },

  /* ── Generic CRUD, Deletion Modes & HTTP ─────────────────────────────────── */
  NOT_FOUND: (entity: string) => `${entity} not found`,
  NOT_FOUND_BY_IDENTIFIER: (entity: string, identifier: string) =>
    `${entity} with identifier "${identifier}" was not found`,
  ALREADY_EXISTS: (entity: string, field: string, value: string) =>
    `${entity} with ${field} "${value}" already exists`,
  CREATED: (entity: string) => `${entity} created successfully`,
  UPDATED: (entity: string) => `${entity} updated successfully`,
  DELETED: (entity: string, mode: 'SOFT' | 'HARD' | 'STATUS' = 'SOFT') => {
    switch (mode) {
      case 'HARD':
        return `${entity} permanently removed from database`;
      case 'STATUS':
        return `${entity} status updated to inactive/archived`;
      case 'SOFT':
      default:
        return `${entity} soft-deleted successfully (recoverable)`;
    }
  },
  RESTORED: (entity: string) => `${entity} restored successfully`,
  STATUS_CHANGED: (entity: string, statusName: string) =>
    `${entity} status changed to "${statusName}"`,
  FETCHED: (entity: string) => `${entity} retrieved successfully`,
  FORBIDDEN: (reason: string) => `Access denied: ${reason}`,
  UNAUTHORIZED: 'Unauthorized request',
  BAD_REQUEST: 'Invalid request data provided',
  INTERNAL_ERROR: 'An unexpected internal error occurred',

  /* ── Users ──────────────────────────────────────────────────────────────── */
  USER: {
    NOT_FOUND: (idOrSlug: string) => `User "${idOrSlug}" not found`,
    EMAIL_EXISTS: (email: string) => `Email "${email}" is already registered`,
    SLUG_EXISTS: (slug: string) => `User slug "${slug}" is already taken`,
    CREATED: 'User created successfully',
    UPDATED: 'User updated successfully',
    DELETED: (mode: 'SOFT' | 'HARD' | 'STATUS' = 'SOFT') =>
      mode === 'HARD'
        ? 'User permanently deleted from system'
        : mode === 'STATUS'
        ? 'User account deactivated (status changed to INACTIVE)'
        : 'User soft-deleted successfully',
    RESTORED: 'User restored successfully',
    ROLE_ASSIGNED: 'Role assigned to user successfully',
    PERMISSION_ADDED: 'User permission override added successfully',
    PERMISSION_REMOVED: 'User permission overrides removed successfully',
    PERMISSIONS_SET: 'User permission overrides replaced successfully',
    PERMISSION_CHECKED: 'User permission evaluated successfully',
  },

  /* ── Roles ──────────────────────────────────────────────────────────────── */
  ROLE: {
    NOT_FOUND: (idOrCode: string) => `Role "${idOrCode}" not found`,
    CODE_EXISTS: (code: string) => `Role code "${code}" already exists`,
    SYSTEM_DELETE: 'System-defined protected roles cannot be deleted',
    CREATED: 'Role created successfully',
    UPDATED: 'Role updated successfully',
    DELETED: (mode: 'SOFT' | 'HARD' | 'STATUS' = 'SOFT') =>
      mode === 'HARD'
        ? 'Role permanently deleted from system'
        : mode === 'STATUS'
        ? 'Role deactivated (status changed to INACTIVE)'
        : 'Role soft-deleted successfully',
    RESTORED: 'Role restored successfully',
    PERMISSIONS_SET: 'Role permission matrix updated successfully',
    PERMISSIONS_ADDED: 'Permissions added to role successfully',
    PERMISSIONS_REMOVED: 'Permissions removed from role successfully',
  },

  /* ── Permissions ────────────────────────────────────────────────────────── */
  PERMISSION: {
    NOT_FOUND: (idOrCode: string) => `Permission "${idOrCode}" not found`,
    CODE_EXISTS: (code: string) => `Permission code "${code}" already exists`,
    CREATED: 'Permission module created successfully',
    UPDATED: 'Permission module updated successfully',
    DELETED: (mode: 'SOFT' | 'HARD' | 'STATUS' = 'SOFT') =>
      mode === 'HARD'
        ? 'Permission module permanently deleted'
        : mode === 'STATUS'
        ? 'Permission module deactivated'
        : 'Permission module soft-deleted successfully',
    RESTORED: 'Permission module restored successfully',
  },

  /* ── Permission Actions ─────────────────────────────────────────────────── */
  PERMISSION_ACTION: {
    NOT_FOUND: (idOrCode: string) => `Permission action "${idOrCode}" not found`,
    CODE_EXISTS: (code: string) => `Action code "${code}" already exists on this permission`,
    CREATED: 'Permission action created successfully',
    UPDATED: 'Permission action updated successfully',
    DELETED: (mode: 'SOFT' | 'HARD' | 'STATUS' = 'SOFT') =>
      mode === 'HARD'
        ? 'Permission action permanently deleted'
        : mode === 'STATUS'
        ? 'Permission action deactivated'
        : 'Permission action soft-deleted successfully',
    RESTORED: 'Permission action restored successfully',
  },

  /* ── Statuses ───────────────────────────────────────────────────────────── */
  STATUS: {
    NOT_FOUND: (idOrCode: string) => `Status "${idOrCode}" not found`,
    CREATED: 'Status created successfully',
    UPDATED: 'Status updated successfully',
    DELETED: (mode: 'SOFT' | 'HARD' | 'STATUS' = 'SOFT') =>
      mode === 'HARD'
        ? 'Status permanently deleted'
        : 'Status soft-deleted successfully',
  },

  /* ── Companies ──────────────────────────────────────────────────────────── */
  COMPANY: {
    NOT_FOUND: (idOrCode: string) => `Company "${idOrCode}" not found`,
    CODE_EXISTS: (code: string) => `Company code "${code}" already exists`,
    CREATED: 'Company created successfully',
    UPDATED: 'Company updated successfully',
    DELETED: (mode: 'SOFT' | 'HARD' | 'STATUS' = 'SOFT') =>
      mode === 'HARD'
        ? 'Company permanently deleted'
        : mode === 'STATUS'
        ? 'Company deactivated'
        : 'Company soft-deleted successfully',
  },

  /* ── Audit Logs ─────────────────────────────────────────────────────────── */
  AUDIT: {
    LOG_FAILED: (action: string) => `Audit log failed for action "${action}" — non-fatal`,
    LOGGED: 'Audit entry recorded successfully',
  },
} as const;

export const API_MESSAGES = {
  businesses: {
    created: 'Business profile created successfully with active verification.',
    updated: 'Business profile updated successfully.',
    deleted: 'Business profile and related catalogs deleted successfully.',
    statusChanged: 'Business verification status updated successfully.',
    notFound: 'Business not found with the provided identifier or slug.',
    slugExists: 'A business with this slug or registration number already exists.',
    transactionFailed: 'Failed to persist business profile. Database transaction rolled back.',
    inquiryReceived: 'Business inquiry registered and notified to vendor.',
  },
  categories: {
    created: 'Product category created successfully.',
    updated: 'Product category updated successfully.',
    deleted: 'Product category deleted successfully.',
    notFound: 'Category not found with the provided ID or slug.',
    slugExists: 'A category with this slug already exists.',
    cannotDeleteWithChildren: 'Cannot delete category with active sub-categories or mapped products.',
    transactionFailed: 'Category operation failed. Database transaction rolled back.',
  },
  common: {
    success: 'Operation completed successfully.',
    unauthorized: 'Authentication required to access this resource.',
    forbidden: 'You do not have permission to perform this action.',
    badRequest: 'Invalid request payload or query parameters.',
    internalError: 'Internal server error occurred. Please contact system administrator.',
    databaseError: 'Database query error encountered.',
  },
} as const;

export type ApiMessages = typeof API_MESSAGES;
export type AppMessages = typeof MSG;
