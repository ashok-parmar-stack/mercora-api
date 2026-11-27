import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionAndPaymentModule1796200000000 implements MigrationInterface {
  name = 'AddSubscriptionAndPaymentModule1796200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. subscription_plans
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscription_plans" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" varchar(50) NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text NULL,
        "label" varchar(60) NULL,
        "is_popular" boolean NOT NULL DEFAULT false,
        "price_minor" bigint NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'INR',
        "billing_interval" varchar(20) NOT NULL DEFAULT 'MONTHLY',
        "duration_days" integer NOT NULL,
        "gst_rate_bps" integer NOT NULL DEFAULT 1800,
        "features" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "limits" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "display_order" integer NOT NULL DEFAULT 0,
        "created_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_subscription_plans" PRIMARY KEY ("id"),
        CONSTRAINT "uq_subscription_plans_code" UNIQUE ("code"),
        CONSTRAINT "chk_subscription_plans_price_minor" CHECK ("price_minor" >= 0),
        CONSTRAINT "chk_subscription_plans_duration_days" CHECK ("duration_days" > 0),
        CONSTRAINT "chk_subscription_plans_gst_rate_bps" CHECK ("gst_rate_bps" >= 0 AND "gst_rate_bps" <= 10000),
        CONSTRAINT "chk_subscription_plans_billing_interval" CHECK ("billing_interval" IN ('MONTHLY', 'QUARTERLY', 'SIX_MONTHS', 'YEARLY', 'CUSTOM'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscription_plans_active_order" ON "subscription_plans" ("is_active", "display_order")`,
    );

    // 2. plan_features
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plan_features" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plan_id" uuid NOT NULL REFERENCES "subscription_plans"("id") ON DELETE CASCADE,
        "feature_key" varchar(100) NOT NULL,
        "feature_name" varchar(150) NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "quota_limit" bigint NULL,
        "quota_period" varchar(30) NULL,
        "created_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_plan_features" PRIMARY KEY ("id"),
        CONSTRAINT "uq_plan_features_plan_key" UNIQUE ("plan_id", "feature_key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_plan_features_plan_id" ON "plan_features" ("plan_id")`,
    );

    // 3. subscriptions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "business_id" varchar(64) NOT NULL REFERENCES "directory_businesses"("id") ON DELETE RESTRICT,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "plan_id" uuid NOT NULL REFERENCES "subscription_plans"("id") ON DELETE RESTRICT,
        "plan_snapshot" jsonb NOT NULL,
        "status" varchar(25) NOT NULL DEFAULT 'PENDING',
        "subtotal_minor" bigint NOT NULL DEFAULT 0,
        "tax_minor" bigint NOT NULL DEFAULT 0,
        "amount_minor" bigint NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'INR',
        "starts_at" timestamptz NULL,
        "expires_at" timestamptz NULL,
        "grace_until" timestamptz NULL,
        "cancel_at_period_end" boolean NOT NULL DEFAULT false,
        "cancelled_at" timestamptz NULL,
        "cancellation_reason" text NULL,
        "scheduled_plan_id" uuid NULL REFERENCES "subscription_plans"("id") ON DELETE SET NULL,
        "scheduled_plan_snapshot" jsonb NULL,
        "scheduled_change_at" timestamptz NULL,
        "renewal_reminder_sent_at" timestamptz NULL,
        "expired_notified_at" timestamptz NULL,
        "previous_subscription_id" uuid NULL REFERENCES "subscriptions"("id") ON DELETE SET NULL,
        "created_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "updated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "chk_subscriptions_status" CHECK ("status" IN ('PENDING', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED')),
        CONSTRAINT "chk_subscriptions_amounts" CHECK ("subtotal_minor" >= 0 AND "tax_minor" >= 0 AND "amount_minor" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscriptions_business_status" ON "subscriptions" ("business_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscriptions_user_status" ON "subscriptions" ("user_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscriptions_status_expires" ON "subscriptions" ("status", "expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscriptions_plan_id" ON "subscriptions" ("plan_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_subscriptions_one_active_per_business" ON "subscriptions" ("business_id") WHERE "status" = 'ACTIVE'`,
    );

    // 4. payments
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "business_id" varchar(64) NOT NULL REFERENCES "directory_businesses"("id") ON DELETE RESTRICT,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE RESTRICT,
        "gateway" varchar(30) NOT NULL DEFAULT 'RAZORPAY',
        "payment_type" varchar(30) NOT NULL DEFAULT 'PURCHASE',
        "gateway_order_id" varchar(120) NULL,
        "gateway_payment_id" varchar(120) NULL,
        "signature_verified" boolean NOT NULL DEFAULT false,
        "verified_at" timestamptz NULL,
        "amount_minor" bigint NOT NULL,
        "refunded_amount_minor" bigint NOT NULL DEFAULT 0,
        "currency" varchar(3) NOT NULL DEFAULT 'INR',
        "payment_status" varchar(30) NOT NULL DEFAULT 'CREATED',
        "payment_method" varchar(40) NULL,
        "payment_method_details" jsonb NULL,
        "failure_code" varchar(100) NULL,
        "failure_reason" text NULL,
        "idempotency_key" varchar(128) NULL,
        "confirmation_notified_at" timestamptz NULL,
        "paid_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_payments" PRIMARY KEY ("id"),
        CONSTRAINT "uq_payments_gateway_order_id" UNIQUE ("gateway_order_id"),
        CONSTRAINT "uq_payments_gateway_payment_id" UNIQUE ("gateway_payment_id"),
        CONSTRAINT "uq_payments_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "chk_payments_amount_minor" CHECK ("amount_minor" >= 0 AND "refunded_amount_minor" >= 0 AND "refunded_amount_minor" <= "amount_minor"),
        CONSTRAINT "chk_payments_status" CHECK ("payment_status" IN ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payments_business_created" ON "payments" ("business_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payments_subscription_id" ON "payments" ("subscription_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payments_status_created" ON "payments" ("payment_status", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payments_user_id" ON "payments" ("user_id")`,
    );

    // 5. payment_attempts
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_attempts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "payment_id" uuid NOT NULL REFERENCES "payments"("id") ON DELETE CASCADE,
        "gateway" varchar(30) NOT NULL DEFAULT 'RAZORPAY',
        "gateway_order_id" varchar(120) NULL,
        "gateway_payment_id" varchar(120) NULL,
        "attempt_number" integer NOT NULL DEFAULT 1,
        "status" varchar(30) NOT NULL,
        "gateway_response" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "failure_reason" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_payment_attempts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payment_attempts_payment_attempt" ON "payment_attempts" ("payment_id", "attempt_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payment_attempts_gateway_order" ON "payment_attempts" ("gateway_order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_payment_attempts_gateway_payment" ON "payment_attempts" ("gateway_payment_id")`,
    );

    // 6. payment_webhook_events
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "gateway" varchar(30) NOT NULL DEFAULT 'RAZORPAY',
        "gateway_event_id" varchar(255) NOT NULL,
        "event_type" varchar(150) NOT NULL,
        "processing_status" varchar(25) NOT NULL DEFAULT 'PENDING',
        "signature_valid" boolean NOT NULL DEFAULT false,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "retry_count" integer NOT NULL DEFAULT 0,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        "processed_at" timestamptz NULL,
        "error_message" text NULL,
        CONSTRAINT "pk_payment_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "uq_webhook_events_gateway_event_id" UNIQUE ("gateway", "gateway_event_id"),
        CONSTRAINT "chk_webhook_events_status" CHECK ("processing_status" IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_webhook_events_status_received" ON "payment_webhook_events" ("processing_status", "received_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_webhook_events_type" ON "payment_webhook_events" ("event_type")`,
    );

    // 7. invoices
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "invoices" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "invoice_number" varchar(64) NOT NULL,
        "business_id" varchar(64) NOT NULL REFERENCES "directory_businesses"("id") ON DELETE RESTRICT,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE RESTRICT,
        "payment_id" uuid NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT,
        "subtotal_minor" bigint NOT NULL,
        "tax_minor" bigint NOT NULL DEFAULT 0,
        "cgst_minor" bigint NOT NULL DEFAULT 0,
        "sgst_minor" bigint NOT NULL DEFAULT 0,
        "igst_minor" bigint NOT NULL DEFAULT 0,
        "total_minor" bigint NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'INR',
        "status" varchar(30) NOT NULL DEFAULT 'ISSUED',
        "seller_details" jsonb NOT NULL,
        "billing_details" jsonb NOT NULL,
        "line_items" jsonb NOT NULL,
        "invoice_date" timestamptz NOT NULL DEFAULT now(),
        "document_reference" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "uq_invoices_invoice_number" UNIQUE ("invoice_number"),
        CONSTRAINT "uq_invoices_payment_id" UNIQUE ("payment_id"),
        CONSTRAINT "chk_invoices_amounts" CHECK ("subtotal_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_invoices_business_date" ON "invoices" ("business_id", "invoice_date" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_invoices_user_id" ON "invoices" ("user_id")`,
    );

    // 8. refunds
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refunds" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "payment_id" uuid NOT NULL REFERENCES "payments"("id") ON DELETE RESTRICT,
        "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE RESTRICT,
        "business_id" varchar(64) NOT NULL REFERENCES "directory_businesses"("id") ON DELETE RESTRICT,
        "gateway" varchar(30) NOT NULL DEFAULT 'RAZORPAY',
        "gateway_refund_id" varchar(120) NULL,
        "amount_minor" bigint NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'INR',
        "status" varchar(30) NOT NULL DEFAULT 'INITIATED',
        "reason" text NOT NULL,
        "idempotency_key" varchar(128) NULL,
        "initiated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "failure_reason" text NULL,
        "refunded_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_refunds" PRIMARY KEY ("id"),
        CONSTRAINT "uq_refunds_gateway_refund_id" UNIQUE ("gateway_refund_id"),
        CONSTRAINT "uq_refunds_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "chk_refunds_amount_minor" CHECK ("amount_minor" > 0),
        CONSTRAINT "chk_refunds_status" CHECK ("status" IN ('INITIATED', 'PENDING', 'PROCESSED', 'FAILED'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_refunds_payment_id" ON "refunds" ("payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_refunds_status_created" ON "refunds" ("status", "created_at" DESC)`,
    );

    // 9. subscription_changes
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscription_changes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "subscription_id" uuid NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE,
        "business_id" varchar(64) NOT NULL REFERENCES "directory_businesses"("id") ON DELETE RESTRICT,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "current_plan_id" uuid NULL REFERENCES "subscription_plans"("id") ON DELETE SET NULL,
        "requested_plan_id" uuid NULL REFERENCES "subscription_plans"("id") ON DELETE SET NULL,
        "change_type" varchar(30) NOT NULL,
        "effective_when" varchar(20) NOT NULL,
        "status" varchar(25) NOT NULL DEFAULT 'PENDING',
        "amount_due_minor" bigint NOT NULL DEFAULT 0,
        "currency" varchar(3) NOT NULL DEFAULT 'INR',
        "effective_at" timestamptz NULL,
        "failure_reason" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_subscription_changes" PRIMARY KEY ("id"),
        CONSTRAINT "chk_subscription_changes_type" CHECK ("change_type" IN ('PURCHASE', 'RENEWAL', 'UPGRADE', 'DOWNGRADE', 'CANCEL', 'ADMIN_OVERRIDE')),
        CONSTRAINT "chk_subscription_changes_when" CHECK ("effective_when" IN ('IMMEDIATE', 'PERIOD_END')),
        CONSTRAINT "chk_subscription_changes_status" CHECK ("status" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_subscription_changes_sub_created" ON "subscription_changes" ("subscription_id", "created_at" DESC)`,
    );

    // 10. subscription_audit_logs
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscription_audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "subscription_id" uuid NULL REFERENCES "subscriptions"("id") ON DELETE SET NULL,
        "business_id" varchar(64) NULL REFERENCES "directory_businesses"("id") ON DELETE SET NULL,
        "actor_type" varchar(20) NOT NULL DEFAULT 'SYSTEM',
        "actor_id" uuid NULL,
        "action" varchar(100) NOT NULL,
        "old_values" jsonb NULL,
        "new_values" jsonb NULL,
        "performed_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "correlation_id" varchar(120) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_subscription_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "chk_sub_audit_actor_type" CHECK ("actor_type" IN ('USER', 'ADMIN', 'SYSTEM', 'GATEWAY'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sub_audit_logs_sub_created" ON "subscription_audit_logs" ("subscription_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sub_audit_logs_biz_created" ON "subscription_audit_logs" ("business_id", "created_at" DESC)`,
    );

    // 11. payment_settings
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_settings" (
        "id" varchar(32) NOT NULL DEFAULT 'DEFAULT',
        "active_gateway" varchar(30) NOT NULL DEFAULT 'RAZORPAY',
        "razorpay_enabled" boolean NOT NULL DEFAULT true,
        "default_currency" varchar(3) NOT NULL DEFAULT 'INR',
        "default_gst_rate_bps" integer NOT NULL DEFAULT 1800,
        "grace_period_days" integer NOT NULL DEFAULT 0,
        "expiring_reminder_days" integer NOT NULL DEFAULT 7,
        "upgrade_policy" varchar(20) NOT NULL DEFAULT 'IMMEDIATE',
        "downgrade_policy" varchar(20) NOT NULL DEFAULT 'END_OF_PERIOD',
        "refund_revokes_access" boolean NOT NULL DEFAULT true,
        "invoice_prefix" varchar(24) NOT NULL DEFAULT 'MERC-INV',
        "company_legal_name" varchar(200) NOT NULL DEFAULT 'Mercora B2B Technologies Pvt. Ltd.',
        "company_gstin" varchar(30) NOT NULL DEFAULT '24AABCM1234A1Z5',
        "company_state" varchar(100) NOT NULL DEFAULT 'Gujarat',
        "company_address" text NOT NULL DEFAULT '1204 Trade Tower, SG Highway, Ahmedabad, Gujarat 380054, India',
        "sac_code" varchar(20) NOT NULL DEFAULT '998314',
        "updated_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_payment_settings" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "payment_settings" ("id") VALUES ('DEFAULT') ON CONFLICT ("id") DO NOTHING
    `);

    // Seed initial subscription plans safely if table is empty
    const existingPlans = await queryRunner.query(`SELECT COUNT(*)::int AS cnt FROM "subscription_plans"`);
    if (Number(existingPlans?.[0]?.cnt || 0) === 0) {
      await queryRunner.query(`
        INSERT INTO "subscription_plans"
          ("code", "name", "description", "label", "is_popular", "price_minor", "currency", "billing_interval", "duration_days", "gst_rate_bps", "features", "limits", "is_active", "display_order")
        VALUES
          (
            'STARTER_MONTHLY',
            'Starter Growth',
            'Essential B2B visibility and catalog presence for growing Indian manufacturers and suppliers.',
            'Starter',
            false,
            99900,
            'INR',
            'MONTHLY',
            30,
            1800,
            '["Up to 2 business directory listings","Up to 20 product catalog entries per business","Up to 50 buyer RFQ enquiries per month","Up to 4 role-based contact channels","GST-compliant digital tax invoices"]'::jsonb,
            '{"maxBusinessListings":2,"maxProducts":20,"maxEnquiriesPerMonth":50,"maxContacts":4,"featuredListing":false,"verifiedPriority":false,"leadInboxAccess":true,"analyticsAccess":true,"prioritySupport":false}'::jsonb,
            true,
            1
          ),
          (
            'PRO_QUARTERLY',
            'Professional Trade',
            'Accelerated lead capture, featured directory placement, and priority verification for active exporters.',
            'Most Popular',
            true,
            249900,
            'INR',
            'QUARTERLY',
            90,
            1800,
            '["Up to 5 business directory listings","Up to 75 product catalog entries per business","Up to 300 buyer RFQ enquiries per month","Featured placement in directory highlights","Priority verification review badge eligibility","Up to 8 role-based contact channels & analytics"]'::jsonb,
            '{"maxBusinessListings":5,"maxProducts":75,"maxEnquiriesPerMonth":300,"maxContacts":8,"featuredListing":true,"verifiedPriority":true,"leadInboxAccess":true,"analyticsAccess":true,"prioritySupport":false}'::jsonb,
            true,
            2
          ),
          (
            'ENTERPRISE_YEARLY',
            'Enterprise Dominator',
            'Full-scale B2B trade suite with unlimited product catalogs, top featured visibility, and dedicated support.',
            'Best Value',
            false,
            899900,
            'INR',
            'YEARLY',
            365,
            1800,
            '["Up to 25 business directory listings","Unlimited product catalog entries","Unlimited buyer RFQ enquiries","Top Featured placement & Premium verification eligibility","Unlimited department & branch contacts","Full B2B analytics & dedicated priority support"]'::jsonb,
            '{"maxBusinessListings":25,"maxProducts":-1,"maxEnquiriesPerMonth":-1,"maxContacts":-1,"featuredListing":true,"verifiedPriority":true,"leadInboxAccess":true,"analyticsAccess":true,"prioritySupport":true}'::jsonb,
            true,
            3
          )
        ON CONFLICT ("code") DO NOTHING
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_changes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refunds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "invoices"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_webhook_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_attempts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plan_features"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscription_plans"`);
  }
}
