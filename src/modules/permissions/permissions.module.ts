import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionEntity, PermissionActionEntity, StatusEntity } from '../../database/entities';
import { SharedModule } from '../../common/shared.module';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import {
  FindPermissionService,
  CreatePermissionService,
  UpdatePermissionService,
  DeletePermissionService,
} from './services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PermissionEntity,
      PermissionActionEntity,
      StatusEntity,
    ]),
    SharedModule,
  ],
  controllers: [PermissionsController],
  providers: [
    FindPermissionService,
    CreatePermissionService,
    UpdatePermissionService,
    DeletePermissionService,
    PermissionsService,
  ],
  exports: [
    FindPermissionService,
    CreatePermissionService,
    UpdatePermissionService,
    DeletePermissionService,
    PermissionsService,
  ],
})
export class PermissionsModule {}
