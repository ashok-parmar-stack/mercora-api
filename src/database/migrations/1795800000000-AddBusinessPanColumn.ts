import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessPanColumn1795800000000 implements MigrationInterface {
  name = 'AddBusinessPanColumn1795800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "directory_businesses" ADD COLUMN IF NOT EXISTS "pan" varchar(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "directory_businesses" DROP COLUMN IF EXISTS "pan"`,
    );
  }
}
