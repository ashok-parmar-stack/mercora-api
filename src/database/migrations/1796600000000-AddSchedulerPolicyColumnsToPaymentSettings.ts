import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchedulerPolicyColumnsToPaymentSettings1796600000000
  implements MigrationInterface
{
  name = 'AddSchedulerPolicyColumnsToPaymentSettings1796600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_settings"
      ADD COLUMN IF NOT EXISTS "scheduler_enabled" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "scheduler_interval_ms" integer NOT NULL DEFAULT 300000,
      ADD COLUMN IF NOT EXISTS "reconcile_pending_minutes" integer NOT NULL DEFAULT 2
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_settings_scheduler_interval'
        ) THEN
          ALTER TABLE "payment_settings"
          ADD CONSTRAINT "chk_payment_settings_scheduler_interval"
          CHECK ("scheduler_interval_ms" >= 60000);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_settings_reconcile_minutes'
        ) THEN
          ALTER TABLE "payment_settings"
          ADD CONSTRAINT "chk_payment_settings_reconcile_minutes"
          CHECK ("reconcile_pending_minutes" >= 1);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_settings"
      ALTER COLUMN "grace_period_days" SET DEFAULT 3,
      ALTER COLUMN "invoice_prefix" SET DEFAULT 'MERC',
      ALTER COLUMN "company_legal_name" SET DEFAULT 'Mercora Technologies Pvt Ltd',
      ALTER COLUMN "company_gstin" SET DEFAULT '',
      ALTER COLUMN "company_address" SET DEFAULT 'Ahmedabad, Gujarat, India'
    `);

    // Ensure DEFAULT database settings row exists so API & workers always read policies from DB
    await queryRunner.query(`
      INSERT INTO "payment_settings" (
        "id",
        "active_gateway",
        "razorpay_enabled",
        "default_currency",
        "default_gst_rate_bps",
        "grace_period_days",
        "expiring_reminder_days",
        "upgrade_policy",
        "downgrade_policy",
        "refund_revokes_access",
        "scheduler_enabled",
        "scheduler_interval_ms",
        "reconcile_pending_minutes",
        "invoice_prefix",
        "company_legal_name",
        "company_gstin",
        "company_state",
        "company_address",
        "sac_code"
      )
      VALUES (
        'DEFAULT',
        'RAZORPAY',
        true,
        'INR',
        1800,
        3,
        7,
        'IMMEDIATE',
        'END_OF_PERIOD',
        true,
        true,
        300000,
        2,
        'MERC',
        'Mercora Technologies Pvt Ltd',
        '',
        'Gujarat',
        'Ahmedabad, Gujarat, India',
        '998314'
      )
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_settings"
      DROP CONSTRAINT IF EXISTS "chk_payment_settings_reconcile_minutes",
      DROP CONSTRAINT IF EXISTS "chk_payment_settings_scheduler_interval",
      DROP COLUMN IF EXISTS "reconcile_pending_minutes",
      DROP COLUMN IF EXISTS "scheduler_interval_ms",
      DROP COLUMN IF EXISTS "scheduler_enabled"
    `);
  }
}
