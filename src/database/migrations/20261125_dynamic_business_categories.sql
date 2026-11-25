-- Migration: Dynamic Business Categories & Business Category Relationships
-- Date: 2026-11-25

-- 1. Update business_categories table: add parent_id, is_active
ALTER TABLE business_categories
  ADD COLUMN IF NOT EXISTS parent_id VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Add foreign key constraint for self-referencing hierarchy if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_business_categories_parent'
  ) THEN
    ALTER TABLE business_categories
      ADD CONSTRAINT fk_business_categories_parent
      FOREIGN KEY (parent_id) REFERENCES business_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_business_categories_parent_id ON business_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_business_categories_is_active ON business_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_business_categories_display_order ON business_categories(display_order);

-- 2. Create business_category_assignments junction table
CREATE TABLE IF NOT EXISTS business_category_assignments (
  id VARCHAR(64) PRIMARY KEY,
  business_id VARCHAR(64) NOT NULL REFERENCES directory_businesses(id) ON DELETE CASCADE,
  category_id VARCHAR(64) NOT NULL REFERENCES business_categories(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_business_category_assignment UNIQUE (business_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_bca_business_id ON business_category_assignments(business_id);
CREATE INDEX IF NOT EXISTS idx_bca_category_id ON business_category_assignments(category_id);
CREATE INDEX IF NOT EXISTS idx_bca_is_primary ON business_category_assignments(is_primary);

-- 3. Add category_data column to directory_businesses for extensible category-specific fields
ALTER TABLE directory_businesses
  ADD COLUMN IF NOT EXISTS category_data JSONB NULL;
