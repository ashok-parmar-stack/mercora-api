import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatusEntity } from '../../database/entities';
import { SharedModule } from '../../common/shared.module';
import { StatusesController } from './statuses.controller';
import { StatusesService } from './statuses.service';
import { FindStatusService } from './services';

@Module({
  imports: [TypeOrmModule.forFeature([StatusEntity]), SharedModule],
  controllers: [StatusesController],
  providers: [FindStatusService, StatusesService],
  exports: [FindStatusService, StatusesService],
})
export class StatusesModule {}
