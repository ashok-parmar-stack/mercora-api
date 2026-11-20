import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CategoryOrmEntity } from "./infrastructure/persistence/entities/category.orm-entity";
import { CATEGORY_REPOSITORY_TOKEN } from "./domain/repositories/category.repository.interface";
import { CategoryRepository } from "./infrastructure/persistence/repositories/category.repository";

// Use cases
import { CreateCategoryUseCase } from "./application/use-cases/create-category/create-category.use-case";
import { UpdateCategoryUseCase } from "./application/use-cases/update-category/update-category.use-case";
import { DeleteCategoryUseCase } from "./application/use-cases/delete-category/delete-category.use-case";
import { GetCategoryUseCase } from "./application/use-cases/get-category/get-category.use-case";
import { ListCategoriesUseCase } from "./application/use-cases/list-categories/list-categories.use-case";

// Controllers
import { PublicCategoryController } from "./presentation/controllers/public-category.controller";
import { AdminCategoryController } from "./presentation/controllers/admin-category.controller";

@Module({
  imports: [TypeOrmModule.forFeature([CategoryOrmEntity])],
  controllers: [PublicCategoryController, AdminCategoryController],
  providers: [
    CreateCategoryUseCase,
    UpdateCategoryUseCase,
    DeleteCategoryUseCase,
    GetCategoryUseCase,
    ListCategoriesUseCase,
    {
      provide: CATEGORY_REPOSITORY_TOKEN,
      useClass: CategoryRepository,
    },
  ],
  exports: [
    CreateCategoryUseCase,
    UpdateCategoryUseCase,
    DeleteCategoryUseCase,
    GetCategoryUseCase,
    ListCategoriesUseCase,
    CATEGORY_REPOSITORY_TOKEN,
  ],
})
export class CategoriesModule {}
