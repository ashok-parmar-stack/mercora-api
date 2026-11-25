import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DataSource } from 'typeorm';
import { BusinessCategoryRepository } from '../src/modules/business-categories/infrastructure/persistence/repositories/business-category.repository';
import { BusinessCategoryOrmEntity } from '../src/modules/business-categories/infrastructure/persistence/entities/business-category.orm-entity';

describe('BusinessCategoryRepository.bulkUpdateOrder', () => {
  it('commits all displayOrder updates inside a single transaction', async () => {
    const events: string[] = [];
    const updates: Array<{ id: string; displayOrder: number }> = [];

    const mockDataSource = {
      createQueryRunner: () => ({
        connect: async () => events.push('connect'),
        startTransaction: async () => events.push('start'),
        commitTransaction: async () => events.push('commit'),
        rollbackTransaction: async () => events.push('rollback'),
        release: async () => events.push('release'),
        manager: {
          update: async (entity: unknown, criteria: { id: string }, partial: { displayOrder: number }) => {
            assert.equal(entity, BusinessCategoryOrmEntity);
            updates.push({ id: criteria.id, displayOrder: partial.displayOrder });
          },
        },
      }),
    } as unknown as DataSource;

    const repo = new BusinessCategoryRepository({} as any, mockDataSource);
    await repo.bulkUpdateOrder([
      { id: 'cat-1', displayOrder: 2 },
      { id: 'cat-2', displayOrder: 1 },
    ]);

    assert.deepEqual(events, ['connect', 'start', 'commit', 'release']);
    assert.deepEqual(updates, [
      { id: 'cat-1', displayOrder: 2 },
      { id: 'cat-2', displayOrder: 1 },
    ]);
  });

  it('rolls back and releases connection if an update throws', async () => {
    const events: string[] = [];
    const mockDataSource = {
      createQueryRunner: () => ({
        connect: async () => events.push('connect'),
        startTransaction: async () => events.push('start'),
        commitTransaction: async () => events.push('commit'),
        rollbackTransaction: async () => events.push('rollback'),
        release: async () => events.push('release'),
        manager: {
          update: async () => {
            throw new Error('DB write failure');
          },
        },
      }),
    } as unknown as DataSource;

    const repo = new BusinessCategoryRepository({} as any, mockDataSource);
    await assert.rejects(() => repo.bulkUpdateOrder([{ id: 'cat-1', displayOrder: 1 }]));
    assert.deepEqual(events, ['connect', 'start', 'rollback', 'release']);
  });
});
