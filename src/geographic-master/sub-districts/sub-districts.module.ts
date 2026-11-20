import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubDistrictEntity } from './entities/sub-district.entity';
import { StatusEntity } from '../../database/entities/status.entity';
import { DistrictEntity } from '../districts/entities/district.entity';
import { SubDistrictsController } from './controllers/sub-districts.controller';
import { SubDistrictsService } from './services/sub-districts.service';
import { SharedModule } from '../../common/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubDistrictEntity, StatusEntity, DistrictEntity]),
    SharedModule,
  ],
  controllers: [SubDistrictsController],
  providers: [SubDistrictsService],
  exports: [SubDistrictsService],
})
export class SubDistrictsModule {}
