import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanComparePriceAndFeatureGroups1796300000000 implements MigrationInterface {
  name = 'AddPlanComparePriceAndFeatureGroups1796300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      ADD COLUMN IF NOT EXISTS "original_price_minor" bigint NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      ADD COLUMN IF NOT EXISTS "feature_groups" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      UPDATE "subscription_plans"
      SET "original_price_minor" = CASE
        WHEN "code" = 'STARTER_MONTHLY' AND "original_price_minor" IS NULL THEN 149900
        WHEN "code" = 'PRO_QUARTERLY' AND "original_price_minor" IS NULL THEN 349900
        WHEN "code" = 'ENTERPRISE_YEARLY' AND "original_price_minor" IS NULL THEN 1199900
        ELSE "original_price_minor"
      END
      WHERE "code" IN ('STARTER_MONTHLY', 'PRO_QUARTERLY', 'ENTERPRISE_YEARLY')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      DROP COLUMN IF EXISTS "feature_groups"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscription_plans"
      DROP COLUMN IF EXISTS "original_price_minor"
    `);
  }
}
