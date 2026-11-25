import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexesAndEnquiries1795600000000 implements MigrationInterface {
  name = 'AddPerformanceIndexesAndEnquiries1795600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Missing FK leading B-tree indexes (11 verified missing FK indexes)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sub_districts_district_id" ON "sub-districts" ("district_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sub_districts_status_id" ON "sub-districts" ("status_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_districts_state_id" ON "districts" ("state_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_districts_status_id" ON "districts" ("status_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_states_country_id" ON "states" ("country_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_states_status_id" ON "states" ("status_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_companies_status_id" ON "companies" ("status_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_roles_status_id" ON "roles" ("status_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_permissions_status_id" ON "permissions" ("status_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_permission_actions_status_id" ON "permission_actions" ("status_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_email_templates_status_id" ON "email_templates" ("status_id")`,
    );

    // 2. Audit logs composite timeline index & directory business pincode index
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_logs_module_created_at" ON "audit_logs" ("module", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_directory_businesses_pincode" ON "directory_businesses" ("pincode")`,
    );

    // 3. Optional pg_trgm GIN indexes to speed up LIKE '%term%' directory searches
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dir_biz_name_trgm" ON "directory_businesses" USING gin (LOWER("name") gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dir_biz_city_trgm" ON "directory_businesses" USING gin (LOWER("city") gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dir_biz_cat_trgm" ON "directory_businesses" USING gin (LOWER("category") gin_trgm_ops)`,
    );

    // 4. Persistent table for directory RFQs and demo walkthrough leads
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "business_enquiries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "business_id" character varying(64) NOT NULL,
        "business_name" character varying(255),
        "sender_name" character varying(150) NOT NULL,
        "sender_email" character varying(255),
        "sender_phone" character varying(50) NOT NULL,
        "company_name" character varying(255),
        "message" text NOT NULL,
        "status" character varying(40) NOT NULL DEFAULT 'NEW',
        "source" character varying(60) NOT NULL DEFAULT 'DIRECTORY_RFQ',
        "ip_address" character varying(64),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_business_enquiries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_business_enquiries_business_id" ON "business_enquiries" ("business_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_business_enquiries_biz_created" ON "business_enquiries" ("business_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "business_enquiries"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dir_biz_cat_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dir_biz_city_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dir_biz_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_directory_businesses_pincode"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_logs_module_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_email_templates_status_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_permission_actions_status_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_permissions_status_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_roles_status_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_companies_status_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_states_status_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_states_country_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_districts_status_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_districts_state_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sub_districts_status_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sub_districts_district_id"`);
  }
}
