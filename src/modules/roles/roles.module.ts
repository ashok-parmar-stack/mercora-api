import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RoleEntity,
  RolePermissionEntity,
  PermissionActionEntity,
  PermissionEntity,
  StatusEntity,
} from '../../database/entities';
import { SharedModule } from '../../common/shared.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import {
  FindRoleService,
  CreateRoleService,
  UpdateRoleService,
  DeleteRoleService,
} from './services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleEntity,
      RolePermissionEntity,
      PermissionActionEntity,
      PermissionEntity,
      StatusEntity,
    ]),
    SharedModule,
  ],
  controllers: [RolesController],
  providers: [
    FindRoleService,
    CreateRoleService,
    UpdateRoleService,
    DeleteRoleService,
    RolesService,
  ],
  exports: [
    FindRoleService,
    CreateRoleService,
    UpdateRoleService,
    DeleteRoleService,
    RolesService,
  ],
})
export class RolesModule {}
