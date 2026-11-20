import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { PermissionResolverService } from './permission-resolver.service';

const allEntities = [
  BusinessOrmEntity,
  CategoryOrmEntity,
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


@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbType = config.get<string>('database.type');
        const dbUrl = config.get<string>('database.url');
        const sslEnabled = config.get<boolean>('database.ssl');

        if (dbType === 'postgres' || dbUrl) {
          return {
            type: 'postgres',
            ...(dbUrl
              ? { url: dbUrl }
              : {
                  host: config.get<string>('database.host'),
                  port: config.get<number>('database.port'),
                  username: config.get<string>('database.username'),
                  password: config.get<string>('database.password'),
                  database: config.get<string>('database.database'),
                }),
            ssl: sslEnabled ? { rejectUnauthorized: false } : false,
            entities: allEntities,
            synchronize: true, // Auto schema sync in development / seed
            logging: false,
            extra: {
              timezone: 'UTC',
            },
          };
        }

        // SQLite fallback
        return {
          type: 'sqlite',
          database: config.get<string>('database.sqlitePath') || './mercora.sqlite',
          entities: allEntities,
          synchronize: true,
          logging: false,
        };
      },
    }),
    TypeOrmModule.forFeature(allEntities),
  ],
  providers: [PermissionResolverService],
  exports: [TypeOrmModule, PermissionResolverService],
})
export class DatabaseModule {}
