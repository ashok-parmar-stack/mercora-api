import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BusinessOrmEntity } from "./infrastructure/persistence/entities/business-orm.entity";
import { BusinessEnquiryEntity } from "../../database/entities/business-enquiry.entity";
import { BUSINESS_REPOSITORY_TOKEN } from "./domain/repositories/business.repository.interface";
import { IBusinessRepositoryToken } from "./domain/interfaces/business-repository.interface";
import { TypeOrmBusinessRepository } from "./infrastructure/persistence/repositories/typeorm-business.repository";

// Use Cases
import { ListBusinessesUseCase } from "./application/use-cases/list-businesses/list-businesses.use-case";
import { GetBusinessUseCase } from "./application/use-cases/get-business/get-business.use-case";
import { CreateBusinessUseCase } from "./application/use-cases/create-business/create-business.use-case";
import { UpdateBusinessUseCase } from "./application/use-cases/update-business/update-business.use-case";
import { DeleteBusinessUseCase } from "./application/use-cases/delete-business/delete-business.use-case";
import { ChangeBusinessStatusUseCase } from "./application/use-cases/change-business-status/change-business-status.use-case";

// Controllers
import { PublicBusinessController } from "./presentation/controllers/public-business.controller";
import { CustomerBusinessController } from "./presentation/controllers/customer-business.controller";
import { AdminBusinessController } from "./presentation/controllers/admin-business.controller";

@Module({
  imports: [TypeOrmModule.forFeature([BusinessOrmEntity, BusinessEnquiryEntity])],
  controllers: [
    PublicBusinessController,
    CustomerBusinessController,
    AdminBusinessController,
  ],
  providers: [
    ListBusinessesUseCase,
    GetBusinessUseCase,
    CreateBusinessUseCase,
    UpdateBusinessUseCase,
    DeleteBusinessUseCase,
    ChangeBusinessStatusUseCase,
    TypeOrmBusinessRepository,
    {
      provide: BUSINESS_REPOSITORY_TOKEN,
      useExisting: TypeOrmBusinessRepository,
    },
    {
      provide: IBusinessRepositoryToken,
      useExisting: TypeOrmBusinessRepository,
    },
  ],
  exports: [
    ListBusinessesUseCase,
    GetBusinessUseCase,
    CreateBusinessUseCase,
    UpdateBusinessUseCase,
    DeleteBusinessUseCase,
    ChangeBusinessStatusUseCase,
    BUSINESS_REPOSITORY_TOKEN,
  ],
})
export class BusinessesModule {}
