import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import {
  PermissionActionEntity,
  PermissionEntity,
  StatusEntity,
} from '../database/entities';

interface PermissionSeedSpec {
  code: string;
  name: string;
  description: string;
  actions: Array<{ code: string; name: string; description: string }>;
}

const ACTION_LABELS: Record<string, { name: string; desc: string }> = {
  VIEW: { name: 'View', desc: 'Read and list records' },
  CREATE: { name: 'Create', desc: 'Create new records' },
  UPDATE: { name: 'Update', desc: 'Modify existing records' },
  DELETE: { name: 'Delete', desc: 'Soft or permanently delete records' },
  VERIFY: { name: 'Verify', desc: 'Approve or verify status' },
  SYNC: { name: 'Sync', desc: 'Synchronize with external sources' },
  RESET: { name: 'Reset', desc: 'Reset and resynchronize data' },
  UPLOAD: { name: 'Upload', desc: 'Upload files to storage' },
  EXPORT: { name: 'Export', desc: 'Export data reports' },
  REFUND: { name: 'Refund', desc: 'Initiate gateway payment refunds' },
  MANAGE_STATUS: { name: 'Manage Status', desc: 'Override or update subscription lifecycle status' },
  MANAGE_PERMISSIONS: { name: 'Manage Permissions', desc: 'Assign or override permissions' },
};

function makeActions(codes: string[]) {
  return codes.map((code) => ({
    code,
    name: ACTION_LABELS[code]?.name || code,
    description: ACTION_LABELS[code]?.desc || `${code} access`,
  }));
}

export const PERMISSION_SEEDS: PermissionSeedSpec[] = [
  {
    code: 'USERS',
    name: 'User Management',
    description: 'Manage platform users, statuses, roles, and UBAC overrides',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_PERMISSIONS']),
  },
  {
    code: 'ROLES',
    name: 'Role Management',
    description: 'Manage RBAC roles and role permission matrices',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_PERMISSIONS']),
  },
  {
    code: 'PERMISSIONS',
    name: 'Permission Catalog',
    description: 'Manage permission modules and granular actions',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE']),
  },
  {
    code: 'BUSINESSES',
    name: 'Business Directory',
    description: 'Manage B2B business listings and verification',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'VERIFY']),
  },
  {
    code: 'CATEGORIES',
    name: 'Master Categories',
    description: 'Manage top-level industry categories',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE']),
  },
  {
    code: 'BUSINESS_CATEGORIES',
    name: 'Business Categories',
    description: 'Manage dynamic business type hierarchy',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE']),
  },
  {
    code: 'PRODUCT_CATEGORIES',
    name: 'Product Categories',
    description: 'Manage product classification tree',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE']),
  },
  {
    code: 'HSN_CODES',
    name: 'HSN Code Master',
    description: 'Manage HSN codes and ICEGATE synchronization',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'SYNC']),
  },
  {
    code: 'GEOGRAPHY',
    name: 'Geographic Master',
    description: 'Manage countries, states, districts, sub-districts, and LGD sync',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'SYNC', 'RESET']),
  },
  {
    code: 'PINCODES',
    name: 'Postal PIN Codes',
    description: 'Manage postal PIN code master and India Post sync',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'SYNC']),
  },
  {
    code: 'EMAIL_TEMPLATES',
    name: 'Email Templates',
    description: 'Manage transactional email templates',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE']),
  },
  {
    code: 'AUDIT_LOGS',
    name: 'Audit Logs',
    description: 'Inspect system security and governance audit trails',
    actions: makeActions(['VIEW', 'EXPORT']),
  },
  {
    code: 'STORAGE',
    name: 'File Storage',
    description: 'Manage uploaded media and assets',
    actions: makeActions(['VIEW', 'UPLOAD', 'DELETE']),
  },
  {
    code: 'SUBSCRIPTION_PLANS',
    name: 'Subscription Plans',
    description: 'Create, configure, and activate subscription plans and pricing',
    actions: makeActions(['VIEW', 'CREATE', 'UPDATE', 'DELETE']),
  },
  {
    code: 'SUBSCRIPTIONS',
    name: 'Business Subscriptions',
    description: 'Inspect business subscriptions and manage lifecycle status overrides',
    actions: makeActions(['VIEW', 'UPDATE', 'MANAGE_STATUS']),
  },
  {
    code: 'PAYMENTS',
    name: 'Subscription Payments & Refunds',
    description: 'View payment transactions, export payment reports, and issue Razorpay refunds',
    actions: makeActions(['VIEW', 'EXPORT', 'REFUND']),
  },
  {
    code: 'INVOICES',
    name: 'Tax Invoices',
    description: 'View and export generated GST tax invoices',
    actions: makeActions(['VIEW', 'EXPORT']),
  },
];

async function bootstrap() {
  console.log('=====================================================');
  console.log('  MERCORA PERMISSION & ACTION SEED SCRIPT            ');
  console.log('=====================================================');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    const statusRepo = dataSource.getRepository(StatusEntity);
    const permRepo = dataSource.getRepository(PermissionEntity);
    const actionRepo = dataSource.getRepository(PermissionActionEntity);

    const activeStatus = await statusRepo.findOne({ where: { code: 'ACTIVE' } });
    const statusId = activeStatus?.id ?? null;

    let createdPerms = 0;
    let createdActions = 0;

    for (const spec of PERMISSION_SEEDS) {
      let perm = await permRepo.findOne({ where: { code: spec.code }, withDeleted: true });
      if (!perm) {
        perm = permRepo.create({
          code: spec.code,
          name: spec.name,
          description: spec.description,
          statusId,
        });
        perm = await permRepo.save(perm);
        createdPerms++;
      } else {
        if (perm.deletedAt) await permRepo.restore(perm.id);
        await permRepo.update(perm.id, {
          name: spec.name,
          description: spec.description,
          ...(statusId ? { statusId } : {}),
        });
      }

      for (const actSpec of spec.actions) {
        let action = await actionRepo.findOne({
          where: { permissionId: perm.id, code: actSpec.code },
          withDeleted: true,
        });
        if (!action) {
          action = actionRepo.create({
            permissionId: perm.id,
            code: actSpec.code,
            name: actSpec.name,
            description: actSpec.description,
            statusId,
          });
          await actionRepo.save(action);
          createdActions++;
        } else {
          if (action.deletedAt) await actionRepo.restore(action.id);
          await actionRepo.update(action.id, {
            name: actSpec.name,
            description: actSpec.description,
            ...(statusId ? { statusId } : {}),
          });
        }
      }
    }

    console.log(
      `Done! Processed ${PERMISSION_SEEDS.length} permissions (${createdPerms} new) and ${createdActions} new actions.`,
    );
  } catch (err: any) {
    console.error('Permission seed failed:', err?.message, err?.stack);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();
