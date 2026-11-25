import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedModule } from '../common/shared.module';
import { CountryEntity } from './countries/entities/country.entity';
import { StateEntity } from './states/entities/state.entity';
import { DistrictEntity } from './districts/entities/district.entity';
import { SubDistrictEntity } from './sub-districts/entities/sub-district.entity';
import { StatusEntity } from '../database/entities/status.entity';

import { CountriesModule } from './countries/countries.module';
import { StatesModule } from './states/states.module';
import { DistrictsModule } from './districts/districts.module';
import { SubDistrictsModule } from './sub-districts/sub-districts.module';

import { LgdSourceAdapter } from './sync/adapters/lgd-source.adapter';
import { GeographicSyncService } from './sync/services/geographic-sync.service';
import { GeographicSyncController } from './sync/controllers/geographic-sync.controller';

import { GeographicSyncSchedulerService } from './sync/services/geographic-sync-scheduler.service';
import { MasterSyncErrorEntity, MasterSyncRunEntity } from '../database/entities';

import { LocationModule } from './location.module';
import { LocationSyncService } from './location-sync.service';
import { LocationQueryService } from './location-query.service';
import { LgdSyncHelperService } from './services/lgd-sync-helper.service';
import { LocationHierarchySyncService } from './services/location-hierarchy-sync.service';
import { LGDSource } from './sources/lgd/lgd.source';
import { LgdStateSource } from './sources/lgd/lgd-state.source';
import { LgdDistrictSource } from './sources/lgd/lgd-district.source';
import { LgdSubDistrictSource } from './sources/lgd/lgd-sub-district.source';

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
    LocationModule,
    CountriesModule,
    StatesModule,
    DistrictsModule,
    SubDistrictsModule,
  ],
  controllers: [GeographicSyncController],
  providers: [
    LgdStateSource,
    LgdDistrictSource,
    LgdSubDistrictSource,
    LGDSource,
    LgdSyncHelperService,
    LocationHierarchySyncService,
    LocationQueryService,
    LocationSyncService,
    LgdSourceAdapter,
    GeographicSyncService,
    GeographicSyncSchedulerService,
  ],
  exports: [
    LocationModule,
    CountriesModule,
    StatesModule,
    DistrictsModule,
    SubDistrictsModule,
    LocationSyncService,
    GeographicSyncService,
    GeographicSyncSchedulerService,
  ],
})
export class GeographicMasterModule { }

