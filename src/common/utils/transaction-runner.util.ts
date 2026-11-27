import { DataSource, QueryRunner } from 'typeorm';
import { MercoraLogger } from '../logger';

const logger = new MercoraLogger('TransactionRunner');

/**
 * Executes a callback within a managed TypeORM database transaction.
 * Automatically handles connection, beginTransaction, commit, rollback on error, and release.
 */
export async function runInTransaction<T>(
  dataSource: DataSource,
  operation: (queryRunner: QueryRunner) => Promise<T>,
  contextName = 'DatabaseOperation',
): Promise<T> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const result = await operation(queryRunner);
    await queryRunner.commitTransaction();
    return result;
  } catch (error: any) {
    logger.error(`[${contextName}] Transaction failed — rolling back`, error);
    try {
      await queryRunner.rollbackTransaction();
    } catch (rollbackError: any) {
      logger.error(`[${contextName}] Transaction rollback error`, rollbackError);
    }
    throw error;
  } finally {
    await queryRunner.release();
  }
}
