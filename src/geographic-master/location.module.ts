import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../common/shared.module';

// Entities
import { CountryEntity } from './countries/entities/country.entity';
import { StateEntity } from './states/entities/state.entity';
import { DistrictEntity } from './districts/entities/district.entity';
import { SubDistrictEntity } from './sub-districts/entities/sub-district.entity';
import { StatusEntity } from '../database/entities/status.entity';
import { MasterSyncRunEntity } from '../database/entities/master-sync-run.entity';
import { MasterSyncErrorEntity } from '../database/entities/master-sync-error.entity';

// Sources
import { LgdStateSource } from './sources/lgd/lgd-state.source';
import { LgdDistrictSource } from './sources/lgd/lgd-district.source';
import { LgdSubDistrictSource } from './sources/lgd/lgd-sub-district.source';
import { LGDSource } from './sources/lgd/lgd.source';

// Sync & Dropdown Services
import { LocationSyncService } from './location-sync.service';
import { LocationController } from './location.controller';
import { AdminLocationSyncController } from './admin-location-sync.controller';

@Module({
  imports: [
    SharedModule,
    TypeOrmModule.forFeature([
      CountryEntity,
      StateEntity,
      DistrictEntity,
      SubDistrictEntity,
      StatusEntity,
      MasterSyncRunEntity,
      MasterSyncErrorEntity,
    ]),
  ],
  controllers: [LocationController, AdminLocationSyncController],
  providers: [
    LgdStateSource,
    LgdDistrictSource,
    LgdSubDistrictSource,
    LGDSource,
    LocationSyncService,
  ],
  exports: [
    LGDSource,
    LocationSyncService,
  ],
})
export class LocationModule {}
