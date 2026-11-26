import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeLiveCategoryCounts,
  expandMasterCategoryTerms,
  resolveCategoryFilterTargets,
  resolvePrimaryCategoryId,
} from "../src/modules/businesses/domain/utils/business-category-matcher";

const SAMPLE_CATEGORIES = [
  { id: "distributor", name: "Distributor", slug: "distributor", code: "DISTRIBUTOR", parentId: null },
  { id: "seller", name: "Seller / Supplier", slug: "seller", code: "SELLER", parentId: null },
  { id: "export", name: "Export Seller / Exporter", slug: "export", code: "EXPORTER", parentId: null },
  { id: "manufacture", name: "Manufacturer", slug: "manufacture", code: "MANUFACTURER", parentId: null },
  { id: "wholesaler", name: "Wholesaler / Distributor", slug: "wholesaler", code: "WHOLESALER", parentId: null },
  { id: "service-provider", name: "Service Provider", slug: "service-provider", code: "SERVICE_PROVIDER", parentId: null },
  { id: "sub-mfg-oem", name: "OEM Manufacturing", slug: "oem-manufacturing", code: "MFG_OEM", parentId: "manufacture" },
];

describe("Business Category Matcher & Live Counts", () => {
  it("maps standalone Distributor separately from Wholesaler / Distributor", () => {
    assert.equal(resolvePrimaryCategoryId("Distributor", SAMPLE_CATEGORIES), "distributor");
    assert.equal(resolvePrimaryCategoryId("Wholesaler", SAMPLE_CATEGORIES), "wholesaler");
    assert.equal(resolvePrimaryCategoryId("Exporter", SAMPLE_CATEGORIES), "export");
    assert.equal(resolvePrimaryCategoryId("Seller / Supplier", SAMPLE_CATEGORIES), "seller");
  });

  it("computes live distinct counts and rolls subcategory assignments into parents", () => {
    const businesses = [
      { id: "b1", businessType: "Exporter" },
      { id: "b2", businessType: "Distributor" },
      { id: "b3", businessType: "Wholesaler" },
      { id: "b4", businessType: "Manufacturer" },
      { id: "b5", businessType: "Seller / Supplier" },
    ];
    const assignments = [{ businessId: "b4", categoryId: "sub-mfg-oem" }];

    const counts = computeLiveCategoryCounts(businesses, assignments, SAMPLE_CATEGORIES);
    assert.equal(counts.get("export"), 1);
    assert.equal(counts.get("distributor"), 1);
    assert.equal(counts.get("wholesaler"), 1);
    assert.equal(counts.get("seller"), 1);
    assert.equal(counts.get("sub-mfg-oem"), 1);
    assert.equal(counts.get("manufacture"), 1);
  });

  it("resolves compound category filter names back to matching businessType values", () => {
    const exportTargets = resolveCategoryFilterTargets("Export Seller / Exporter", SAMPLE_CATEGORIES);
    assert.ok(exportTargets.categoryIds.includes("export"));
    assert.ok(exportTargets.typeTokens.includes("exporter"));

    const wholesalerTargets = resolveCategoryFilterTargets("Wholesaler / Distributor", SAMPLE_CATEGORIES);
    assert.deepEqual(wholesalerTargets.categoryIds, ["wholesaler"]);
    assert.equal(wholesalerTargets.typeTokens.includes("distributor"), false);

    const distributorTargets = resolveCategoryFilterTargets("Distributor", SAMPLE_CATEGORIES);
    assert.deepEqual(distributorTargets.categoryIds, ["distributor"]);
    assert.equal(distributorTargets.typeTokens.includes("wholesaler"), false);

    const mfgTargets = resolveCategoryFilterTargets("Manufacturer", SAMPLE_CATEGORIES);
    assert.ok(mfgTargets.categoryIds.includes("sub-mfg-oem"));
  });

  it("expands master category synonyms cleanly", () => {
    const terms = expandMasterCategoryTerms("Agriculture & Food");
    assert.ok(terms.includes("food & agro processing"));
  });
});
