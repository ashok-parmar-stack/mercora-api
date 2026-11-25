import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ListBusinessCategoriesUseCase } from "../../application/use-cases/list-business-categories.use-case";
import { GetBusinessCategoryUseCase } from "../../application/use-cases/get-business-category.use-case";
import { GetBusinessCategoryTreeUseCase } from "../../application/use-cases/get-business-category-tree.use-case";
import { BusinessCategoryQueryDto } from "../../application/dto/business-category-query.dto";

@ApiTags("Business Categories / Types Master")
@Controller("business-categories")
export class PublicBusinessCategoryController {
  constructor(
    private readonly listUseCase: ListBusinessCategoriesUseCase,
    private readonly getUseCase: GetBusinessCategoryUseCase,
    private readonly treeUseCase: GetBusinessCategoryTreeUseCase
  ) {}

  @Get()
  @ApiOperation({ summary: "List active business categories (Manufacturer, Seller, Exporter, Wholesaler, etc.)" })
  @ApiResponse({ status: 200, description: "Active business categories" })
  async list(@Query() query: BusinessCategoryQueryDto) {
    return this.listUseCase.execute(query);
  }

  @Get("tree")
  @ApiOperation({ summary: "Get hierarchical tree of active business categories with subcategories" })
  async tree() {
    return this.treeUseCase.execute();
  }

  @Get(":slug")
  @ApiOperation({ summary: "Get single business category by slug, code, or ID" })
  async getBySlug(@Param("slug") slug: string) {
    return this.getUseCase.execute(slug);
  }
}

@ApiTags("Business Categories / Types Master")
@Controller("business-types")
export class PublicBusinessTypeAliasController extends PublicBusinessCategoryController {}
