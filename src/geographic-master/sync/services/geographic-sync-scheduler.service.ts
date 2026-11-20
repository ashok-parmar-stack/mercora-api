import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { GeographicSyncService } from './geographic-sync.service';
import { MercoraLogger } from '../../../common/logger';

/**
 * GeographicSyncSchedulerService
 *
 * Manual-only trigger service for Geographic Master synchronization.
 * Automated recurring intervals and startup syncs have been removed so
 * geographic synchronization only runs when explicitly invoked on-demand
 * via API endpoints or CLI scripts.
 */
@Injectable()
export class GeographicSyncSchedulerService implements OnModuleDestroy {
  private readonly logger = new MercoraLogger(GeographicSyncSchedulerService.name);
  private isSyncing = false;

  constructor(private readonly syncService: GeographicSyncService) {}

  onModuleDestroy() {
    this.isSyncing = false;
  }

  /**
   * Run the complete official government geography pipeline on-demand.
   * Invoked ONLY manually via admin controller or CLI command.
   */
  async runManualSync(userId = 'manual-admin-trigger') {
    if (this.isSyncing) {
      this.logger.warn('Geographic sync already in progress, skipping duplicate call.');
      return { success: false, message: 'Sync already in progress' };
    }

    this.isSyncing = true;
    this.logger.log(`Executing Manual Geographic Master Sync (LGD + India Post) requested by: ${userId}`);

    try {
      const summary = await this.syncService.syncAllGovernmentGeography(userId);
      this.logger.log(`Manual Sync Completed Successfully: ${summary.message}`);
      return summary;
    } catch (err: any) {
      this.logger.error(`Manual Sync Failed: ${err?.message}`, err?.stack);
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Backward-compatible alias for any external callers
   */
  async runScheduledSync() {
    return this.runManualSync('manual-caller');
  }
}

