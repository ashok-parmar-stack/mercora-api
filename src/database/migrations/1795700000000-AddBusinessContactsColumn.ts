import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessContactsColumn1795700000000 implements MigrationInterface {
  name = 'AddBusinessContactsColumn1795700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "directory_businesses" ADD COLUMN IF NOT EXISTS "contacts" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "directory_businesses" DROP COLUMN IF EXISTS "contacts"`,
    );
  }
}
