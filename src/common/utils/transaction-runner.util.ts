import { DataSource, QueryRunner } from "typeorm";
import { Logger } from "@nestjs/common";

const logger = new Logger("TransactionRunner");

/**
 * Executes a callback within a managed TypeORM database transaction.
 * Automatically handles connection, beginTransaction, commit, rollback on error, and release.
 */
export async function runInTransaction<T>(
  dataSource: DataSource,
  operation: (queryRunner: QueryRunner) => Promise<T>,
  contextName: string = "DatabaseOperation"
): Promise<T> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const result = await operation(queryRunner);
    await queryRunner.commitTransaction();
    return result;
  } catch (error: any) {
    logger.error(`[${contextName}] Transaction failed: ${error.message}. Rolling back.`, error.stack);
    try {
      await queryRunner.rollbackTransaction();
    } catch (rollbackError: any) {
      logger.error(`[${contextName}] Error during transaction rollback: ${rollbackError.message}`);
    }
    throw error;
  } finally {
    await queryRunner.release();
  }
}
