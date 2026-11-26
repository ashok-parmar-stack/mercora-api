import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterBusinessLogoUrlToText1795900000000 implements MigrationInterface {
  name = 'AlterBusinessLogoUrlToText1795900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "directory_businesses" ALTER COLUMN "logo_url" TYPE text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "directory_businesses" ALTER COLUMN "logo_url" TYPE character varying(255)`
    );
  }
}
