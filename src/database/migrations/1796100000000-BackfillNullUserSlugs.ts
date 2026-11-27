import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillNullUserSlugs1796100000000 implements MigrationInterface {
  name = 'BackfillNullUserSlugs1796100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users
      SET slug = CONCAT(
        COALESCE(
          NULLIF(
            TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(COALESCE(name, SPLIT_PART(email, '@', 1))), '[^a-z0-9]+', '-', 'g')),
            ''
          ),
          'user'
        ),
        '-',
        LEFT(REPLACE(id::text, '-', ''), 6)
      )
      WHERE slug IS NULL OR TRIM(slug) = '';
    `);
  }

  public async down(): Promise<void> {
    // Non-destructive backfill; keep populated slugs intact
  }
}
