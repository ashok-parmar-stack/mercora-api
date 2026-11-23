import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import {
  StatusEntity,
  RoleEntity,
  PermissionEntity,
  PermissionActionEntity,
  RolePermissionEntity,
  UserPermissionEntity,
  CompanyEntity,
  UserEntity,
  CompanyUserEntity,
  EmailTemplateEntity,
  EmailLogEntity,
  AuditLogEntity,
  CountryEntity,
  StateEntity,
  DistrictEntity,
  SubDistrictEntity,
  HsnCodeEntity,
  MasterSyncRunEntity,
  MasterSyncErrorEntity,
  ProductCategoryEntity,
  HsnCodeCategoryEntity,
  SessionEntity,
  EmailVerificationEntity,
  PasswordResetEntity,
} from './entities';
import { BusinessOrmEntity } from '../modules/businesses/infrastructure/persistence/entities/business-orm.entity';
import { CategoryOrmEntity } from '../modules/categories/infrastructure/persistence/entities/category.orm-entity';
import { BusinessCategoryOrmEntity } from '../modules/business-categories/infrastructure/persistence/entities/business-category.orm-entity';

// Helper to manually load environment file
function loadEnvFile(envFilePath: string) {
  if (!fs.existsSync(envFilePath)) return;
  const content = fs.readFileSync(envFilePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// Auto-detect environment file
const envFile = process.env.ENV_FILE ||
  (fs.existsSync(path.resolve(__dirname, '../../.env.production'))
    ? path.resolve(__dirname, '../../.env.production')
    : path.resolve(__dirname, '../../.env'));

if (fs.existsSync(envFile)) {
  loadEnvFile(envFile);
}

export const allEntities = [
  BusinessOrmEntity,
  CategoryOrmEntity,
  BusinessCategoryOrmEntity,
  StatusEntity,
  RoleEntity,
  PermissionEntity,
  PermissionActionEntity,
  RolePermissionEntity,
  UserPermissionEntity,
  CompanyEntity,
  UserEntity,
  CompanyUserEntity,
  EmailTemplateEntity,
  EmailLogEntity,
  AuditLogEntity,
  CountryEntity,
  StateEntity,
  DistrictEntity,
  SubDistrictEntity,
  HsnCodeEntity,
  MasterSyncRunEntity,
  MasterSyncErrorEntity,
  ProductCategoryEntity,
  HsnCodeCategoryEntity,
  SessionEntity,
  EmailVerificationEntity,
  PasswordResetEntity,
];

const dbUrl = process.env.DATABASE_URL;
const isNeonOrSsl = !!(dbUrl && (dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require'))) || process.env.DB_SSL === 'true';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  ...(dbUrl
    ? { url: dbUrl }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgrespassword',
        database: process.env.DB_NAME || 'mercora_db',
      }),
  ssl: isNeonOrSsl ? { rejectUnauthorized: false } : false,
  entities: allEntities,
  migrations: [path.join(__dirname, 'migrations/*{.ts,.js}')],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
};

export const AppDataSource = new DataSource(dataSourceOptions);
export default AppDataSource;
