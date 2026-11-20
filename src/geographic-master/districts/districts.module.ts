import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistrictEntity } from './entities/district.entity';
import { StatusEntity } from '../../database/entities/status.entity';
import { StateEntity } from '../states/entities/state.entity';
import { DistrictsController } from './controllers/districts.controller';
import { DistrictsService } from './services/districts.service';
import { SharedModule } from '../../common/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DistrictEntity, StatusEntity, StateEntity]),
    SharedModule,
  ],
  controllers: [DistrictsController],
  providers: [DistrictsService],
  exports: [DistrictsService],
})
export class DistrictsModule {}
