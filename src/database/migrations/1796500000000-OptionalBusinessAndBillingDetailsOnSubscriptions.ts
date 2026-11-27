import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptionalBusinessAndBillingDetailsOnSubscriptions1796500000000
  implements MigrationInterface
{
  name = 'OptionalBusinessAndBillingDetailsOnSubscriptions1796500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "billing_details" jsonb NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ALTER COLUMN "business_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
      ALTER COLUMN "business_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "invoices"
      ALTER COLUMN "business_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "refunds"
      ALTER COLUMN "business_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "subscription_changes"
      ALTER COLUMN "business_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_subscriptions_one_active_per_business"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_subscriptions_one_active_per_business"
      ON "subscriptions" ("business_id")
      WHERE "business_id" IS NOT NULL AND "status" IN ('ACTIVE', 'PAST_DUE')
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_subscriptions_one_active_per_user"
      ON "subscriptions" ("user_id")
      WHERE "business_id" IS NULL AND "status" IN ('ACTIVE', 'PAST_DUE')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_subscriptions_one_active_per_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP COLUMN IF EXISTS "billing_details"
    `);
  }
}
