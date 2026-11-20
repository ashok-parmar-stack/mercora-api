import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountryEntity } from './entities/country.entity';
import { StatusEntity } from '../../database/entities/status.entity';
import { CountriesService } from './services/countries.service';
import { CountriesController } from './controllers/countries.controller';
import { SharedModule } from '../../common/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CountryEntity, StatusEntity]),
    SharedModule,
  ],
  controllers: [CountriesController],
  providers: [CountriesService],
  exports: [CountriesService, TypeOrmModule],
})
export class CountriesModule {}
