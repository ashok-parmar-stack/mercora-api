/**
 * Centralized Configuration for External Government & Open Data APIs
 * Only authorized external sources:
 * 1. LGD (Local Government Directory) - https://lgdirectory.gov.in/
 * 2. Postal PIN Code API - https://api.postalpincode.in/
 */
export const EXTERNAL_APIS = {
  // ── Postal PIN Code & Post Office API ──────────────────────────────────
  POSTAL_PINCODE: {
    BASE_URL: process.env.POSTAL_PINCODE_API_URL || 'https://api.postalpincode.in',
    PINCODE_ENDPOINT: '/pincode',
    POST_OFFICE_ENDPOINT: '/postoffice',
  },

  // ── Government Local Government Directory (LGD) APIs ─────────────────────
  LGD: {
    BASE_URL: process.env.LGD_API_BASE_URL || 'https://lgdirectory.gov.in',
    API_KEY: process.env.LGD_API_KEY || process.env.DATA_GOV_IN_API_KEY || '',
    STATE_LIST_ENDPOINT: '/ws/stateList',
    DISTRICT_LIST_ENDPOINT: '/ws/districtList',
    SUBDISTRICT_LIST_ENDPOINT: '/ws/subdistrictList',
  },

  // ── Indian Customs / GST / ICEGATE APIs (for Catalog Master) ─────────────
  ICEGATE: {
    BASE_URL: process.env.ICEGATE_API_BASE_URL || 'https://www.icegate.gov.in',
    HSN_TARIFF_ENDPOINT: '/tariff',
  },
} as const;

export type ExternalApisConfig = typeof EXTERNAL_APIS;

