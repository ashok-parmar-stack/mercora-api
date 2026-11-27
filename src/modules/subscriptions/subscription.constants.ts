export enum BillingInterval {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SIX_MONTHS = 'SIX_MONTHS',
  YEARLY = 'YEARLY',
  CUSTOM = 'CUSTOM',
}

export enum SubscriptionStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  CREATED = 'CREATED',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

export enum PaymentGateway {
  RAZORPAY = 'RAZORPAY',
}

export enum PaymentType {
  PURCHASE = 'PURCHASE',
  RENEWAL = 'RENEWAL',
  UPGRADE = 'UPGRADE',
}

export enum RefundStatus {
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

export enum WebhookProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

export enum SubscriptionChangeType {
  PURCHASE = 'PURCHASE',
  RENEWAL = 'RENEWAL',
  UPGRADE = 'UPGRADE',
  DOWNGRADE = 'DOWNGRADE',
  CANCEL = 'CANCEL',
  ADMIN_OVERRIDE = 'ADMIN_OVERRIDE',
}

export enum SubscriptionChangeEffectiveWhen {
  IMMEDIATE = 'IMMEDIATE',
  PERIOD_END = 'PERIOD_END',
}

export enum SubscriptionChangeStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum SubscriptionAuditActorType {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
  GATEWAY = 'GATEWAY',
}

export const SUBSCRIPTION_FEATURE_KEYS = {
  BUSINESS_LISTINGS: 'business_listings',
  PRODUCT_LISTINGS: 'product_listings',
  ENQUIRIES_PER_MONTH: 'enquiries_per_month',
  CONTACT_NUMBERS: 'contact_numbers',
  FEATURED_LISTING: 'featured_listing',
  VERIFIED_PRIORITY: 'verified_priority',
  LEAD_INBOX_ACCESS: 'lead_inbox_access',
  ANALYTICS_ACCESS: 'analytics_access',
  PRIORITY_SUPPORT: 'priority_support',
} as const;

export interface PlanLimits {
  maxBusinessListings: number;
  maxProducts: number;
  maxEnquiriesPerMonth: number;
  maxContacts: number;
  featuredListing: boolean;
  verifiedPriority: boolean;
  leadInboxAccess: boolean;
  analyticsAccess: boolean;
  prioritySupport: boolean;
}

export interface PlanFeatureGroup {
  key: string;
  title: string;
  included: boolean;
  items: string[];
}

function formatCapLabel(value: number, singular: string, plural: string): string {
  if (value < 0) return `Unlimited ${plural}`;
  return `Up to ${value} ${value === 1 ? singular : plural}`;
}

export function buildSystemPlanFeatures(
  limits: PlanLimits,
  durationDays?: number,
): string[] {
  const days = Number(durationDays || 30);
  const bullets = [
    formatCapLabel(
      limits.maxBusinessListings,
      'business directory listing',
      'business directory listings',
    ),
    `${formatCapLabel(limits.maxProducts, 'product catalog entry', 'product catalog entries')} per business`,
    `${formatCapLabel(limits.maxEnquiriesPerMonth, 'buyer RFQ enquiry', 'buyer RFQ enquiries')} per month`,
    `${formatCapLabel(limits.maxContacts, 'department contact channel', 'department contact channels')}`,
  ];

  if (limits.featuredListing) {
    bullets.push('Featured placement in directory highlights');
  }
  if (limits.verifiedPriority) {
    bullets.push('Priority business verification review queue');
  }
  if (limits.analyticsAccess) {
    bullets.push('Real-time quota & subscription analytics');
  }
  if (limits.prioritySupport) {
    bullets.push('Dedicated onboarding & priority support');
  }
  bullets.push(`GST-compliant digital tax invoices (${days} days access)`);

  return bullets;
}

export function buildSystemFeatureGroups(
  limits: PlanLimits,
  durationDays?: number,
): PlanFeatureGroup[] {
  const days = Number(durationDays || 30);
  const accessLabel =
    days >= 360
      ? `${days} Days Annual Validity`
      : days >= 85 && days <= 95
        ? `${days} Days Quarterly Validity`
        : `${days} Days Access Period`;

  return [
    {
      key: 'directory_storefront',
      title: 'Directory Listing & Storefront',
      included: limits.maxBusinessListings !== 0,
      items: [
        formatCapLabel(limits.maxBusinessListings, 'Verified Business Listing', 'Verified Business Listings'),
        'State, City, District & Pincode Geographic Discovery',
        `GSTIN, CIN & Verification Profile Visibility (${accessLabel})`,
      ],
    },
    {
      key: 'product_catalog',
      title: 'Product Catalog & Classification',
      included: limits.maxProducts !== 0,
      items: [
        `${formatCapLabel(limits.maxProducts, 'Product Entry', 'Product Entries')} per Business`,
        'Industrial Category & Subcategory Mapping',
        'HSN Code & Product Specification Showcase',
      ],
    },
    {
      key: 'leads_enquiries',
      title: 'Buyer Leads & Contact Channels',
      included: Boolean(limits.leadInboxAccess),
      items: [
        `${formatCapLabel(limits.maxEnquiriesPerMonth, 'Buyer RFQ Lead', 'Buyer RFQ Leads')} / Month`,
        `${formatCapLabel(limits.maxContacts, 'Department Contact', 'Department Contacts')} per Listing`,
        'Buyer Enquiry Inbox & Contact Reveal (/enquiries)',
      ],
    },
    {
      key: 'analytics_billing',
      title: 'Subscription Analytics & GST Invoicing',
      included: Boolean(limits.analyticsAccess),
      items: [
        'Real-Time Entitlement & Usage Quota Tracker',
        'GST-Compliant Tax Invoice PDF Downloads (CGST/SGST/IGST)',
        'Razorpay Multi-Method Payment & Renewal Ledger',
      ],
    },
    {
      key: 'featured_priority',
      title: 'Featured Visibility & Priority Verification',
      included: Boolean(limits.featuredListing || limits.verifiedPriority),
      items: [
        limits.featuredListing
          ? 'Featured B2B Directory Highlight Placement'
          : 'Standard Directory Placement',
        limits.verifiedPriority
          ? 'Priority Business Verification Review Queue'
          : 'Standard Verification Review Queue',
      ],
    },
    {
      key: 'priority_support',
      title: 'Dedicated Priority Support',
      included: Boolean(limits.prioritySupport),
      items: [
        'Dedicated Account & Catalog Onboarding Support',
        'Priority Billing, Invoice & Renewal Assistance',
      ],
    },
  ];
}

export interface PlanSnapshot {
  planId: string;
  code: string;
  name: string;
  description?: string | null;
  label?: string | null;
  priceMinor: number;
  originalPriceMinor?: number | null;
  currency: string;
  billingInterval: BillingInterval | string;
  durationDays: number;
  gstRateBps: number;
  features: string[];
  featureGroups?: PlanFeatureGroup[];
  limits: PlanLimits;
  capturedAt: string;
}

export const DEFAULT_FREE_PLAN_LIMITS: PlanLimits = {
  maxBusinessListings: 1,
  maxProducts: 5,
  maxEnquiriesPerMonth: 15,
  maxContacts: 2,
  featuredListing: false,
  verifiedPriority: false,
  leadInboxAccess: true,
  analyticsAccess: false,
  prioritySupport: false,
};

export const SUBSCRIPTION_EMAIL_TEMPLATES = {
  SUBSCRIPTION_PURCHASED: 'SUBSCRIPTION_PURCHASED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  SUBSCRIPTION_RENEWED: 'SUBSCRIPTION_RENEWED',
  SUBSCRIPTION_EXPIRING_SOON: 'SUBSCRIPTION_EXPIRING_SOON',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  REFUND_INITIATED: 'REFUND_INITIATED',
  REFUND_COMPLETED: 'REFUND_COMPLETED',
} as const;

export const INITIAL_SUBSCRIPTION_PLANS = [
  {
    code: 'STARTER_MONTHLY',
    name: 'Starter Plan',
    description:
      'Essential B2B directory presence, product showcase, and RFQ lead capture for growing suppliers.',
    label: 'Starter',
    isPopular: false,
    originalPriceMinor: 149900, // ₹1,499 MRP
    priceMinor: 99900, // ₹999.00 + GST
    currency: 'INR',
    billingInterval: BillingInterval.MONTHLY,
    durationDays: 30,
    gstRateBps: 1800,
    isActive: true,
    displayOrder: 1,
    features: [
      'Up to 2 business directory listings',
      'Up to 20 product catalog entries per business',
      'Up to 50 buyer RFQ enquiries per month',
      'Up to 4 role-based contact channels',
      'GST-compliant digital tax invoices',
    ],
    limits: {
      maxBusinessListings: 2,
      maxProducts: 20,
      maxEnquiriesPerMonth: 50,
      maxContacts: 4,
      featuredListing: false,
      verifiedPriority: false,
      leadInboxAccess: true,
      analyticsAccess: true,
      prioritySupport: false,
    } satisfies PlanLimits,
  },
  {
    code: 'PRO_QUARTERLY',
    name: 'Business Plan',
    description:
      'Accelerated lead capture, featured directory placement, and priority verification for active suppliers.',
    label: 'Most Popular',
    isPopular: true,
    originalPriceMinor: 349900, // ₹3,499 MRP
    priceMinor: 249900, // ₹2,499.00 + GST
    currency: 'INR',
    billingInterval: BillingInterval.QUARTERLY,
    durationDays: 90,
    gstRateBps: 1800,
    isActive: true,
    displayOrder: 2,
    features: [
      'Up to 5 business directory listings',
      'Up to 75 product catalog entries per business',
      'Up to 300 buyer RFQ enquiries per month',
      'Featured placement in directory highlights',
      'Priority verification review badge eligibility',
      'Up to 8 role-based contact channels & analytics',
    ],
    limits: {
      maxBusinessListings: 5,
      maxProducts: 75,
      maxEnquiriesPerMonth: 300,
      maxContacts: 8,
      featuredListing: true,
      verifiedPriority: true,
      leadInboxAccess: true,
      analyticsAccess: true,
      prioritySupport: false,
    } satisfies PlanLimits,
  },
  {
    code: 'ENTERPRISE_YEARLY',
    name: 'Enterprise Plan',
    description:
      'Full-scale B2B directory suite with unlimited product catalogs, top featured visibility, and dedicated support.',
    label: 'Best Value',
    isPopular: false,
    originalPriceMinor: 1199900, // ₹11,999 MRP
    priceMinor: 899900, // ₹8,999.00 + GST
    currency: 'INR',
    billingInterval: BillingInterval.YEARLY,
    durationDays: 365,
    gstRateBps: 1800,
    isActive: true,
    displayOrder: 3,
    features: [
      'Up to 25 business directory listings',
      'Unlimited product catalog entries',
      'Unlimited buyer RFQ enquiries',
      'Top Featured placement & Priority verification eligibility',
      'Unlimited department & branch contacts',
      'Full B2B analytics & dedicated priority support',
    ],
    limits: {
      maxBusinessListings: 25,
      maxProducts: -1,
      maxEnquiriesPerMonth: -1,
      maxContacts: -1,
      featuredListing: true,
      verifiedPriority: true,
      leadInboxAccess: true,
      analyticsAccess: true,
      prioritySupport: true,
    } satisfies PlanLimits,
  },
] as const;

export const SYSTEM_PLAN_TEMPLATES = [
  INITIAL_SUBSCRIPTION_PLANS[0],
  INITIAL_SUBSCRIPTION_PLANS[1],
  {
    code: 'GROWTH_SIX_MONTHS',
    name: 'Growth Plan',
    description:
      'High-volume multi-branch storefront presence, expanded product catalog, and accelerated buyer RFQ pipeline.',
    label: 'High Growth',
    isPopular: false,
    originalPriceMinor: 599900, // ₹5,999 MRP
    priceMinor: 449900, // ₹4,499.00 + GST
    currency: 'INR',
    billingInterval: BillingInterval.SIX_MONTHS,
    durationDays: 180,
    gstRateBps: 1800,
    isActive: true,
    displayOrder: 3,
    features: [
      'Up to 10 business directory listings',
      'Up to 150 product catalog entries per business',
      'Up to 750 buyer RFQ enquiries per month',
      'Up to 12 department contact channels',
      'Featured placement in directory highlights',
      'Priority business verification review queue',
      'Real-time quota & subscription analytics',
    ],
    limits: {
      maxBusinessListings: 10,
      maxProducts: 150,
      maxEnquiriesPerMonth: 750,
      maxContacts: 12,
      featuredListing: true,
      verifiedPriority: true,
      leadInboxAccess: true,
      analyticsAccess: true,
      prioritySupport: false,
    } satisfies PlanLimits,
  },
  {
    ...INITIAL_SUBSCRIPTION_PLANS[2],
    displayOrder: 4,
  },
] as const;
