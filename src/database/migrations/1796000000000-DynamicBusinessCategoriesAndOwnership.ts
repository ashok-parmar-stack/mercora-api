import { MigrationInterface, QueryRunner } from 'typeorm';

export class DynamicBusinessCategoriesAndOwnership1796000000000 implements MigrationInterface {
  name = 'DynamicBusinessCategoriesAndOwnership1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE business_categories
        ADD COLUMN IF NOT EXISTS parent_id VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    `);

    await queryRunner.query(`
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
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_business_categories_parent_id ON business_categories(parent_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_business_categories_is_active ON business_categories(is_active);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_business_categories_display_order ON business_categories(display_order);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS business_category_assignments (
        id VARCHAR(64) PRIMARY KEY,
        business_id VARCHAR(64) NOT NULL REFERENCES directory_businesses(id) ON DELETE CASCADE,
        category_id VARCHAR(64) NOT NULL REFERENCES business_categories(id) ON DELETE CASCADE,
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_business_category_assignment UNIQUE (business_id, category_id)
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_bca_business_id ON business_category_assignments(business_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_bca_category_id ON business_category_assignments(category_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_bca_is_primary ON business_category_assignments(is_primary);`);

    await queryRunner.query(`
      ALTER TABLE directory_businesses
        ADD COLUMN IF NOT EXISTS category_data JSONB NULL,
        ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(64) NULL;
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_directory_businesses_owner_user_id ON directory_businesses(owner_user_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_directory_businesses_owner_user_id;`);
    await queryRunner.query(`
      ALTER TABLE directory_businesses
        DROP COLUMN IF EXISTS owner_user_id,
        DROP COLUMN IF EXISTS category_data;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS business_category_assignments;`);
  }
}
