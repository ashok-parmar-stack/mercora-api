/**
 * ──────────────────────────────────────────────────────────────────────────
 * MERCORA BACKEND API — HEADERS & METADATA CONFIGURATION
 * Single source of truth for Swagger documentation titles, version tags,
 * telemetry headers, and route descriptions.
 * ──────────────────────────────────────────────────────────────────────────
 */

export const API_HEADERS = {
  swagger: {
    title: "Mercora Enterprise B2B Engine & Business Directory API",
    description: "High-performance REST API for verified Indian business discovery, multi-tenant catalogs, and buyer RFQ automation.",
    version: "2.4.0",
    contactName: "Mercora Core Engineering",
    contactEmail: "api-support@mercora.example.com",
  },

  modules: {
    businesses: {
      tag: "Businesses Directory",
      publicDescription: "Public discovery endpoints for searching verified suppliers and catalogs.",
      customerDescription: "Customer endpoints for managing bookmarks and supplier RFQ inquiries.",
      adminDescription: "Administrator endpoints for vetting businesses and setting verification tiers.",
    },
    categories: {
      tag: "Product Categories",
      publicDescription: "Public category hierarchy and product taxonomy exploration.",
      adminDescription: "Admin category management, HSN mappings, and taxonomy tree operations.",
    },
  },
} as const;

export type ApiHeaders = typeof API_HEADERS;
