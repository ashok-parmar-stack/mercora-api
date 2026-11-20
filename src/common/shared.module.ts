/**
 * SharedModule
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides common shared infrastructure services across all feature modules:
 *   - PermissionResolverService
 *   - AuditService
 *   - MessageService (centralized dynamic message engine)
 *   - DatabaseModule (TypeORM repositories)
 */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { MessageService } from './messages/message.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AuditController],
  providers: [AuditService, MessageService],
  exports: [DatabaseModule, AuditService, MessageService],
})
export class SharedModule {}
