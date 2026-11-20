import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StateEntity } from './entities/state.entity';
import { StatusEntity } from '../../database/entities/status.entity';
import { CountryEntity } from '../countries/entities/country.entity';
import { StatesController } from './controllers/states.controller';
import { StatesService } from './services/states.service';
import { SharedModule } from '../../common/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StateEntity, StatusEntity, CountryEntity]),
    SharedModule,
  ],
  controllers: [StatesController],
  providers: [StatesService],
  exports: [StatesService],
})
export class StatesModule {}
