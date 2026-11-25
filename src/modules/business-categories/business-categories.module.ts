import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BusinessCategoryOrmEntity } from "./infrastructure/persistence/entities/business-category.orm-entity";
import { BUSINESS_CATEGORY_REPOSITORY_TOKEN } from "./domain/repositories/business-category.repository.interface";
import { BusinessCategoryRepository } from "./infrastructure/persistence/repositories/business-category.repository";

// Use cases
import { ListBusinessCategoriesUseCase } from "./application/use-cases/list-business-categories.use-case";
import { GetBusinessCategoryUseCase } from "./application/use-cases/get-business-category.use-case";
import { GetBusinessCategoryTreeUseCase } from "./application/use-cases/get-business-category-tree.use-case";
import { CreateBusinessCategoryUseCase } from "./application/use-cases/create-business-category.use-case";
import { UpdateBusinessCategoryUseCase } from "./application/use-cases/update-business-category.use-case";
import { DeleteBusinessCategoryUseCase } from "./application/use-cases/delete-business-category.use-case";

// Controllers
import {
  PublicBusinessCategoryController,
  PublicBusinessTypeAliasController,
} from "./presentation/controllers/public-business-category.controller";
import { AdminBusinessCategoryController } from "./presentation/controllers/admin-business-category.controller";

@Module({
  imports: [TypeOrmModule.forFeature([BusinessCategoryOrmEntity])],
  controllers: [
    PublicBusinessCategoryController,
    PublicBusinessTypeAliasController,
    AdminBusinessCategoryController,
  ],
  providers: [
    ListBusinessCategoriesUseCase,
    GetBusinessCategoryUseCase,
    GetBusinessCategoryTreeUseCase,
    CreateBusinessCategoryUseCase,
    UpdateBusinessCategoryUseCase,
    DeleteBusinessCategoryUseCase,
    {
      provide: BUSINESS_CATEGORY_REPOSITORY_TOKEN,
      useClass: BusinessCategoryRepository,
    },
  ],
  exports: [
    ListBusinessCategoriesUseCase,
    GetBusinessCategoryUseCase,
    GetBusinessCategoryTreeUseCase,
    CreateBusinessCategoryUseCase,
    UpdateBusinessCategoryUseCase,
    DeleteBusinessCategoryUseCase,
    BUSINESS_CATEGORY_REPOSITORY_TOKEN,
  ],
})
export class BusinessCategoriesModule {}
