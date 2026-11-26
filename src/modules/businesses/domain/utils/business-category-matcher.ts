export interface MinimalBusinessCategory {
  id: string;
  name: string;
  slug: string;
  code: string;
  parentId?: string | null;
}

export interface MinimalBusinessRecord {
  id: string;
  businessType: string;
}

export interface CategoryAssignmentRecord {
  businessId: string;
  categoryId: string;
}

/**
 * Known parent links for seeded business subcategories that were inserted without parent_id.
 */
export const SUBCATEGORY_PARENT_REPAIR_MAP: Record<string, string> = {
  "sub-log-3pl": "logistics",
  "sub-log-cold": "logistics",
  "sub-cus-import": "customs-broker",
  "sub-cus-export": "customs-broker",
  "sub-exp-merchant": "export",
  "sub-exp-mfg": "export",
  "sub-mfg-oem": "manufacture",
  "sub-mfg-contract": "manufacture",
  "sub-mfg-fabricator": "manufacture",
  "sub-frt-sea": "freight-forwarder",
  "sub-frt-air": "freight-forwarder",
};

/**
 * Master sector synonyms so directory categories and business category fields resolve together.
 */
export const MASTER_CATEGORY_ALIASES: Array<string[]> = [
  ["agriculture & food", "food & agro processing", "food & agriculture", "agriculture food"],
  ["chemicals & plastics", "chemicals & petrochemicals", "chemicals plastics"],
  ["renewable & solar energy", "renewable energy", "renewable solar energy"],
  ["electrical & electronics", "electronics & electrical", "electrical electronics"],
  ["ceramics & tiles", "ceramics tiles", "ceramics & building materials"],
];

export function normalizeTaxonomyText(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toTaxonomySlug(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolves synonym labels that represent the same master industry category.
 */
export function expandMasterCategoryTerms(input: string): string[] {
  const norm = normalizeTaxonomyText(input);
  if (!norm) return [];

  const terms = new Set<string>([
    input.toLowerCase().trim(),
    norm,
  ]);

  for (const group of MASTER_CATEGORY_ALIASES) {
    const normalizedGroup = group.map(normalizeTaxonomyText);
    if (normalizedGroup.some((entry) => entry === norm || entry.includes(norm) || norm.includes(entry))) {
      for (const alias of group) {
        terms.add(alias.toLowerCase().trim());
        terms.add(normalizeTaxonomyText(alias));
      }
    }
  }

  return Array.from(terms).filter(Boolean);
}

/**
 * Splits compound display names (e.g. "Export Seller / Exporter") into exact candidate labels.
 */
function splitCompoundLabels(name: string): string[] {
  return name
    .split("/")
    .map((part) => normalizeTaxonomyText(part))
    .filter(Boolean);
}

/**
 * Resolves the canonical root or specific category ID for a business's `businessType`.
 * Exact id/slug/code/name matches always win over compound label parts so "Distributor"
 * resolves to `distributor` rather than `wholesaler` ("Wholesaler / Distributor").
 */
export function resolvePrimaryCategoryId(
  businessType: string | undefined | null,
  categories: MinimalBusinessCategory[],
): string | null {
  const raw = String(businessType || "").trim();
  const norm = normalizeTaxonomyText(raw);
  if (!norm) return null;

  // 1. Exact id, slug, code, or normalized name match
  for (const cat of categories) {
    if (
      cat.id.toLowerCase() === raw.toLowerCase() ||
      cat.slug.toLowerCase() === raw.toLowerCase() ||
      cat.code.toLowerCase() === raw.toLowerCase() ||
      normalizeTaxonomyText(cat.name) === norm
    ) {
      return cat.id;
    }
  }

  // 2. Compound display name segment match (e.g. "Exporter" -> "Export Seller / Exporter")
  for (const cat of categories) {
    const segments = splitCompoundLabels(cat.name);
    if (segments.includes(norm)) {
      return cat.id;
    }
  }

  // 3. Stem/prefix fallback (e.g. "Supplier" -> "Seller / Supplier", "Exporters" -> "export")
  for (const cat of categories) {
    const codeNorm = normalizeTaxonomyText(cat.code);
    const slugNorm = normalizeTaxonomyText(cat.slug);
    if (
      norm === codeNorm ||
      norm === slugNorm ||
      (norm.length >= 4 && (codeNorm.startsWith(norm) || norm.startsWith(codeNorm)))
    ) {
      return cat.id;
    }
  }

  return null;
}

/**
 * Resolves all matching category IDs and raw businessType labels for filtering `directory_businesses`.
 * Includes child subcategory IDs whenever a parent category is selected.
 */
export function resolveCategoryFilterTargets(
  filterValue: string,
  categories: MinimalBusinessCategory[],
): { categoryIds: string[]; typeTokens: string[] } {
  const raw = String(filterValue || "").trim();
  const norm = normalizeTaxonomyText(raw);
  const categoryIds = new Set<string>();
  const typeTokens = new Set<string>();

  if (!norm || norm === "all") {
    return { categoryIds: [], typeTokens: [] };
  }

  typeTokens.add(raw.toLowerCase());

  const exactMatched = categories.filter(
    (c) =>
      c.id.toLowerCase() === raw.toLowerCase() ||
      c.slug.toLowerCase() === raw.toLowerCase() ||
      c.code.toLowerCase() === raw.toLowerCase() ||
      normalizeTaxonomyText(c.name) === norm,
  );

  const matched =
    exactMatched.length > 0
      ? exactMatched
      : categories.filter((c) => splitCompoundLabels(c.name).includes(norm));

  if (matched.length === 0) {
    splitCompoundLabels(raw).forEach((t) => {
      const ownedByStandalone = categories.some(
        (other) => normalizeTaxonomyText(other.name) === t,
      );
      if (!ownedByStandalone) {
        typeTokens.add(t);
      }
    });
  }

  for (const cat of matched) {
    categoryIds.add(cat.id);
    typeTokens.add(cat.name.toLowerCase().trim());
    typeTokens.add(cat.code.toLowerCase().trim());
    typeTokens.add(cat.slug.toLowerCase().trim());

    // Add child subcategories
    const children = categories.filter((child) => child.parentId === cat.id);
    for (const child of children) {
      categoryIds.add(child.id);
      typeTokens.add(child.name.toLowerCase().trim());
      typeTokens.add(child.code.toLowerCase().trim());
      typeTokens.add(child.slug.toLowerCase().trim());
    }

    // Add unambiguous compound tokens (only add split segments if no standalone category owns that exact token)
    for (const segment of splitCompoundLabels(cat.name)) {
      const ownedByAnotherStandaloneCat = categories.some(
        (other) => other.id !== cat.id && normalizeTaxonomyText(other.name) === segment,
      );
      if (!ownedByAnotherStandaloneCat) {
        typeTokens.add(segment);
      }
    }
  }

  return {
    categoryIds: Array.from(categoryIds),
    typeTokens: Array.from(typeTokens).filter(Boolean),
  };
}

/**
 * Computes live distinct business counts per category ID using explicit assignments
 * with fallback resolution via `businessType`, and rolls child counts into parents.
 */
export function computeLiveCategoryCounts(
  businesses: MinimalBusinessRecord[],
  assignments: CategoryAssignmentRecord[],
  categories: MinimalBusinessCategory[],
): Map<string, number> {
  const memberSets = new Map<string, Set<string>>();
  for (const cat of categories) {
    memberSets.set(cat.id, new Set<string>());
  }

  const businessIdsWithExplicitAssignment = new Set<string>();
  const validBusinessIds = new Set(businesses.map((b) => b.id));

  for (const row of assignments) {
    if (!validBusinessIds.has(row.businessId)) continue;
    businessIdsWithExplicitAssignment.add(row.businessId);
    const targetSet = memberSets.get(row.categoryId);
    if (targetSet) {
      targetSet.add(row.businessId);
    }
  }

  for (const biz of businesses) {
    if (businessIdsWithExplicitAssignment.has(biz.id)) continue;
    const primaryCatId = resolvePrimaryCategoryId(biz.businessType, categories);
    if (primaryCatId && memberSets.has(primaryCatId)) {
      memberSets.get(primaryCatId)!.add(biz.id);
    }
  }

  // Roll child subcategory business IDs up into their parent category set
  for (const cat of categories) {
    if (cat.parentId && memberSets.has(cat.parentId)) {
      const parentSet = memberSets.get(cat.parentId)!;
      const childSet = memberSets.get(cat.id);
      if (childSet) {
        for (const bizId of childSet) {
          parentSet.add(bizId);
        }
      }
    }
  }

  const counts = new Map<string, number>();
  for (const [catId, ids] of memberSets.entries()) {
    counts.set(catId, ids.size);
  }
  return counts;
}
