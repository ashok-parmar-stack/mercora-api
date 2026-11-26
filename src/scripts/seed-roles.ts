import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import {
  PermissionActionEntity,
  RoleEntity,
  RolePermissionEntity,
  StatusEntity,
} from '../database/entities';

interface RoleSeedSpec {
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  /** '*' grants all actions; otherwise array of 'PERMISSION_CODE:ACTION_CODE' */
  permissions: '*' | string[];
}

export const ROLE_SEEDS: RoleSeedSpec[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Super Administrator',
    description: 'Full unrestricted platform access across all modules and system settings',
    isSystem: true,
    permissions: '*',
  },
  {
    code: 'ADMIN',
    name: 'Administrator',
    description: 'Administrative access across users, roles, catalog, and operations',
    isSystem: true,
    permissions: [
      'USERS:VIEW', 'USERS:CREATE', 'USERS:UPDATE', 'USERS:DELETE', 'USERS:MANAGE_PERMISSIONS',
      'ROLES:VIEW', 'ROLES:CREATE', 'ROLES:UPDATE', 'ROLES:DELETE', 'ROLES:MANAGE_PERMISSIONS',
      'PERMISSIONS:VIEW', 'PERMISSIONS:CREATE', 'PERMISSIONS:UPDATE', 'PERMISSIONS:DELETE',
      'BUSINESSES:VIEW', 'BUSINESSES:CREATE', 'BUSINESSES:UPDATE', 'BUSINESSES:DELETE', 'BUSINESSES:VERIFY',
      'CATEGORIES:VIEW', 'CATEGORIES:CREATE', 'CATEGORIES:UPDATE', 'CATEGORIES:DELETE',
      'BUSINESS_CATEGORIES:VIEW', 'BUSINESS_CATEGORIES:CREATE', 'BUSINESS_CATEGORIES:UPDATE', 'BUSINESS_CATEGORIES:DELETE',
      'PRODUCT_CATEGORIES:VIEW', 'PRODUCT_CATEGORIES:CREATE', 'PRODUCT_CATEGORIES:UPDATE', 'PRODUCT_CATEGORIES:DELETE',
      'HSN_CODES:VIEW', 'HSN_CODES:CREATE', 'HSN_CODES:UPDATE', 'HSN_CODES:DELETE', 'HSN_CODES:SYNC',
      'GEOGRAPHY:VIEW', 'GEOGRAPHY:CREATE', 'GEOGRAPHY:UPDATE', 'GEOGRAPHY:DELETE', 'GEOGRAPHY:SYNC',
      'PINCODES:VIEW', 'PINCODES:CREATE', 'PINCODES:UPDATE', 'PINCODES:DELETE', 'PINCODES:SYNC',
      'EMAIL_TEMPLATES:VIEW', 'EMAIL_TEMPLATES:CREATE', 'EMAIL_TEMPLATES:UPDATE', 'EMAIL_TEMPLATES:DELETE',
      'AUDIT_LOGS:VIEW', 'AUDIT_LOGS:EXPORT',
      'STORAGE:VIEW', 'STORAGE:UPLOAD', 'STORAGE:DELETE',
    ],
  },
  {
    code: 'DATA_MANAGER',
    name: 'Data Manager',
    description: 'Catalog, geographic, HSN, and directory data stewardship',
    isSystem: true,
    permissions: [
      'BUSINESSES:VIEW', 'BUSINESSES:CREATE', 'BUSINESSES:UPDATE', 'BUSINESSES:VERIFY',
      'CATEGORIES:VIEW', 'CATEGORIES:CREATE', 'CATEGORIES:UPDATE', 'CATEGORIES:DELETE',
      'BUSINESS_CATEGORIES:VIEW', 'BUSINESS_CATEGORIES:CREATE', 'BUSINESS_CATEGORIES:UPDATE', 'BUSINESS_CATEGORIES:DELETE',
      'PRODUCT_CATEGORIES:VIEW', 'PRODUCT_CATEGORIES:CREATE', 'PRODUCT_CATEGORIES:UPDATE', 'PRODUCT_CATEGORIES:DELETE',
      'HSN_CODES:VIEW', 'HSN_CODES:CREATE', 'HSN_CODES:UPDATE', 'HSN_CODES:DELETE', 'HSN_CODES:SYNC',
      'GEOGRAPHY:VIEW', 'GEOGRAPHY:CREATE', 'GEOGRAPHY:UPDATE', 'GEOGRAPHY:DELETE', 'GEOGRAPHY:SYNC',
      'PINCODES:VIEW', 'PINCODES:CREATE', 'PINCODES:UPDATE', 'PINCODES:DELETE', 'PINCODES:SYNC',
      'STORAGE:VIEW', 'STORAGE:UPLOAD',
    ],
  },
  {
    code: 'SALES',
    name: 'Sales Representative',
    description: 'Commercial directory onboarding and customer support',
    isSystem: true,
    permissions: [
      'BUSINESSES:VIEW', 'BUSINESSES:CREATE', 'BUSINESSES:UPDATE',
      'CATEGORIES:VIEW', 'BUSINESS_CATEGORIES:VIEW', 'GEOGRAPHY:VIEW', 'PINCODES:VIEW',
      'STORAGE:VIEW', 'STORAGE:UPLOAD',
    ],
  },
  {
    code: 'CUSTOMER',
    name: 'Customer',
    description: 'Standard B2B buyer/supplier account',
    isSystem: true,
    permissions: [
      'BUSINESSES:VIEW', 'BUSINESSES:CREATE', 'BUSINESSES:UPDATE',
      'CATEGORIES:VIEW', 'BUSINESS_CATEGORIES:VIEW', 'STORAGE:UPLOAD',
    ],
  },
  {
    code: 'VIEWER',
    name: 'Viewer',
    description: 'Read-only directory access',
    isSystem: true,
    permissions: [
      'BUSINESSES:VIEW', 'CATEGORIES:VIEW', 'BUSINESS_CATEGORIES:VIEW', 'GEOGRAPHY:VIEW',
    ],
  },
];

async function bootstrap() {
  console.log('=====================================================');
  console.log('  MERCORA ROLE & ROLE-PERMISSION SEED SCRIPT         ');
  console.log('=====================================================');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    const statusRepo = dataSource.getRepository(StatusEntity);
    const roleRepo = dataSource.getRepository(RoleEntity);
    const actionRepo = dataSource.getRepository(PermissionActionEntity);
    const rolePermRepo = dataSource.getRepository(RolePermissionEntity);

    const activeStatus = await statusRepo.findOne({ where: { code: 'ACTIVE' } });
    const statusId = activeStatus?.id ?? null;

    const allActions = await actionRepo.find({ relations: ['permission'] });
    const actionByKey = new Map<string, PermissionActionEntity>();
    for (const act of allActions) {
      if (act.permission?.code) {
        actionByKey.set(`${act.permission.code}:${act.code}`, act);
      }
    }

    let createdRoles = 0;
    let linkedMappings = 0;

    for (const spec of ROLE_SEEDS) {
      let role = await roleRepo.findOne({ where: { code: spec.code }, withDeleted: true });
      if (!role) {
        role = roleRepo.create({
          code: spec.code,
          name: spec.name,
          description: spec.description,
          isSystem: spec.isSystem,
          statusId,
        });
        role = await roleRepo.save(role);
        createdRoles++;
      } else {
        if (role.deletedAt) await roleRepo.restore(role.id);
        await roleRepo.update(role.id, {
          name: spec.name,
          description: spec.description,
          isSystem: spec.isSystem,
          ...(statusId ? { statusId } : {}),
        });
      }

      const targetActions =
        spec.permissions === '*'
          ? allActions
          : spec.permissions
              .map((key) => actionByKey.get(key))
              .filter((a): a is PermissionActionEntity => Boolean(a));

      for (const act of targetActions) {
        const exists = await rolePermRepo.findOne({
          where: { roleId: role.id, permissionActionId: act.id },
        });
        if (!exists) {
          await rolePermRepo.save(
            rolePermRepo.create({
              roleId: role.id,
              permissionActionId: act.id,
            }),
          );
          linkedMappings++;
        }
      }
    }

    console.log(
      `Done! Processed ${ROLE_SEEDS.length} roles (${createdRoles} new) and added ${linkedMappings} role-permission mappings.`,
    );
  } catch (err: any) {
    console.error('Role seed failed:', err?.message, err?.stack);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

bootstrap();
