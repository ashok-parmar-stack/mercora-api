import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  UserEntity,
  UserPermissionEntity,
  RolePermissionEntity,
  PermissionActionEntity,
  PermissionEntity,
  StatusEntity,
} from '../../database/entities';
import { SharedModule } from '../../common/shared.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import {
  FindUserService,
  CreateUserService,
  UpdateUserService,
  DeleteUserService,
} from './services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserPermissionEntity,
      RolePermissionEntity,
      PermissionActionEntity,
      PermissionEntity,
      StatusEntity,
    ]),
    SharedModule,
  ],
  controllers: [UsersController],
  providers: [
    FindUserService,
    CreateUserService,
    UpdateUserService,
    DeleteUserService,
    UsersService,
  ],
  exports: [
    FindUserService,
    CreateUserService,
    UpdateUserService,
    DeleteUserService,
    UsersService,
  ],
})
export class UsersModule {}
