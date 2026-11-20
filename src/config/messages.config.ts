/**
 * ──────────────────────────────────────────────────────────────────────────
 * MERCORA BACKEND API — GLOBAL MESSAGES CONFIGURATION
 * Single source of truth for all API responses, validation errors,
 * transaction errors, and status messages.
 * ──────────────────────────────────────────────────────────────────────────
 */

export const API_MESSAGES = {
  businesses: {
    created: "Business profile created successfully with active verification.",
    updated: "Business profile updated successfully.",
    deleted: "Business profile and related catalogs deleted successfully.",
    statusChanged: "Business verification status updated successfully.",
    notFound: "Business not found with the provided identifier or slug.",
    slugExists: "A business with this slug or registration number already exists.",
    transactionFailed: "Failed to persist business profile. Database transaction rolled back.",
    inquiryReceived: "Business inquiry registered and notified to vendor.",
  },

  categories: {
    created: "Product category created successfully.",
    updated: "Product category updated successfully.",
    deleted: "Product category deleted successfully.",
    notFound: "Category not found with the provided ID or slug.",
    slugExists: "A category with this slug already exists.",
    cannotDeleteWithChildren: "Cannot delete category with active sub-categories or mapped products.",
    transactionFailed: "Category operation failed. Database transaction rolled back.",
  },

  common: {
    success: "Operation completed successfully.",
    unauthorized: "Authentication required to access this resource.",
    forbidden: "You do not have permission to perform this action.",
    badRequest: "Invalid request payload or query parameters.",
    internalError: "Internal server error occurred. Please contact system administrator.",
    databaseError: "Database query error encountered.",
  },
} as const;

export type ApiMessages = typeof API_MESSAGES;
