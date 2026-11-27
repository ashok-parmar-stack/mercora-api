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
  BusinessEnquiryEntity,
} from './entities';
import { BusinessOrmEntity } from '../modules/businesses/infrastructure/persistence/entities/business-orm.entity';
import { CategoryOrmEntity } from '../modules/categories/infrastructure/persistence/entities/category.orm-entity';
import { BusinessCategoryOrmEntity } from '../modules/business-categories/infrastructure/persistence/entities/business-category.orm-entity';
import {
  SubscriptionPlanEntity,
  PlanFeatureEntity,
  SubscriptionEntity,
  PaymentEntity,
  PaymentAttemptEntity,
  PaymentWebhookEventEntity,
  InvoiceEntity,
  RefundEntity,
  SubscriptionChangeEntity,
  SubscriptionAuditLogEntity,
  PaymentSettingsEntity,
} from '../modules/subscriptions/entities';
import { PermissionResolverService } from './permission-resolver.service';

const allEntities = [
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
  BusinessEnquiryEntity,
  SubscriptionPlanEntity,
  PlanFeatureEntity,
  SubscriptionEntity,
  PaymentEntity,
  PaymentAttemptEntity,
  PaymentWebhookEventEntity,
  InvoiceEntity,
  RefundEntity,
  SubscriptionChangeEntity,
  SubscriptionAuditLogEntity,
  PaymentSettingsEntity,
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
        const synchronize = Boolean(config.get<boolean>('database.synchronize'));
        const logging = Boolean(config.get<boolean>('database.logging'));
        const poolMax = config.get<number>('database.poolMax') ?? 15;
        const idleTimeoutMillis = config.get<number>('database.idleTimeoutMillis') ?? 30000;
        const connectionTimeoutMillis =
          config.get<number>('database.connectionTimeoutMillis') ?? 5000;
        const statementTimeoutMs =
          config.get<number>('database.statementTimeoutMs') ?? 30000;

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
            ssl: sslEnabled
              ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
              : false,
            entities: allEntities,
            synchronize,
            logging,
            extra: {
              timezone: 'UTC',
              max: poolMax,
              idleTimeoutMillis,
              connectionTimeoutMillis,
              ...(statementTimeoutMs > 0
                ? { statement_timeout: statementTimeoutMs }
                : {}),
            },
          };
        }

        // SQLite fallback
        return {
          type: 'sqlite',
          database: config.get<string>('database.sqlitePath') || './mercora.sqlite',
          entities: allEntities,
          synchronize,
          logging,
        };
      },
    }),
    TypeOrmModule.forFeature(allEntities),
  ],
  providers: [PermissionResolverService],
  exports: [TypeOrmModule, PermissionResolverService],
})
export class DatabaseModule {}
