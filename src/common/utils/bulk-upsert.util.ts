import { DataSource, ObjectLiteral, Repository } from 'typeorm';
import { runInTransaction } from './transaction-runner.util';

/**
 * Persists an array of entities in bounded chunks inside a single TypeORM transaction,
 * avoiding slow row-by-row sequential round-trips and partial writes.
 */
export async function saveInChunksTransactional<T extends ObjectLiteral>(
  dataSource: DataSource,
  entityClass: new () => T,
  items: T[],
  chunkSize = 200,
  contextName = 'BulkSave',
): Promise<number> {
  if (!items || items.length === 0) return 0;

  let savedCount = 0;
  await runInTransaction(
    dataSource,
    async (qr) => {
      const repo: Repository<T> = qr.manager.getRepository(entityClass);
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        await repo.save(chunk);
        savedCount += chunk.length;
      }
    },
    contextName,
  );

  return savedCount;
}
