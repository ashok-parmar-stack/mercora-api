import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

/**
 * StorageModule
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides S3-compatible file storage via Neon Object Storage (AWS SDK v3).
 * Supports:
 *  - Direct upload (PutObject)
 *  - Presigned upload URLs (for browser-side direct upload)
 *  - Presigned download/view URLs
 *  - File deletion
 *  - File metadata retrieval
 *
 * Compatible with: Neon Object Storage, AWS S3, MinIO, Cloudflare R2
 */
@Module({
  imports: [ConfigModule],
  providers: [StorageService],
  controllers: [StorageController],
  exports: [StorageService],
})
export class StorageModule {}
