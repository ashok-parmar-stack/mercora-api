import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GeographicSyncService } from '../geographic-master/sync/services/geographic-sync.service';

async function bootstrap() {
  console.log('=====================================================');
  console.log('  MERCORA GEOGRAPHIC MASTER SYNC SCRIPT (ALL INDIA)  ');
  console.log('=====================================================');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const syncService = app.get(GeographicSyncService);
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];

  try {
    if (only === 'subdistricts') {
      console.log('\n[1/1] Syncing official All-India Sub-Districts (Talukas / Tehsils)...');
      const res = await syncService.syncLgdSubDistricts(undefined, 'cli-sync-script');
      console.log('Result:', res);
    } else {
      console.log('\n[1/3] Syncing official All-India States & UTs (LGD)...');
      const statesRes = await syncService.syncLgdStates('cli-sync-script');
      console.log('States:', statesRes);

      console.log('\n[2/3] Syncing official All-India Districts (LGD)...');
      const distRes = await syncService.syncLgdDistricts(undefined, 'cli-sync-script');
      console.log('Districts:', distRes);

      console.log('\n[3/3] Syncing official All-India Sub-Districts / Talukas (LGD)...');
      const subDistRes = await syncService.syncLgdSubDistricts(undefined, 'cli-sync-script');
      console.log('Sub-Districts:', subDistRes);
    }

    console.log('\n=====================================================');
    console.log('  ALL-INDIA LOCATION MASTER SYNC COMPLETE!           ');
    console.log('=====================================================\n');

  } catch (err: any) {
    console.error('\nSync failed with error:', err?.message, err?.stack);
  } finally {
    await app.close();
    process.exit(0);
  }
}

bootstrap();
