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
import { LocationQueryService } from './location-query.service';
import { LgdSyncHelperService } from './services/lgd-sync-helper.service';
import { LocationHierarchySyncService } from './services/location-hierarchy-sync.service';
import { LocationController } from './location.controller';

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
  controllers: [LocationController],
  providers: [
    LgdStateSource,
    LgdDistrictSource,
    LgdSubDistrictSource,
    LGDSource,
    LgdSyncHelperService,
    LocationHierarchySyncService,
    LocationQueryService,
    LocationSyncService,
  ],
  exports: [
    LGDSource,
    LocationSyncService,
    LocationQueryService,
    LgdSyncHelperService,
    LocationHierarchySyncService,
  ],
})
export class LocationModule {}
