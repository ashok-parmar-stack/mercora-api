import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { HealthModule } from './health/health.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { UsersModule } from './modules/users/users.module';
import { StatusesModule } from './modules/statuses/statuses.module';
import { GeographicMasterModule } from './geographic-master/geographic-master.module';
import { CatalogMasterModule } from './catalog-master/catalog-master.module';
import { EmailModule } from './modules/email/email.module';
import { AuthModule } from './modules/auth/auth.module';
import { StorageModule } from './modules/storage/storage.module';
import { BusinessesModule } from './modules/businesses/businesses.module';
import { CategoriesModule } from './modules/categories/categories.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '.env.local'],
    }),
    DatabaseModule,
    ElasticsearchModule,
    HealthModule,
    // ── B2B Businesses & Categories Clean Architecture Domain ─────────────
    BusinessesModule,
    CategoriesModule,
    // ── RBAC Modules ────────────────────────────────────────────────────────
    StatusesModule,
    RolesModule,
    PermissionsModule,
    UsersModule,
    // ── Geographic Master Phase 1 ──────────────────────────────────────────
    GeographicMasterModule,
    // ── Catalog Master (HSN & Flipkart-style Categories) ─────────────────────
    CatalogMasterModule,
    // ── Communication & Dynamic Email System ─────────────────────────────────
    EmailModule,
    // ── Authentication & Dynamic Single-Session Management ───────────────────
    AuthModule,
    // ── S3-Compatible Object Storage (Neon / AWS S3 / MinIO / R2) ─────────────
    StorageModule,
  ],
})
export class AppModule {}


