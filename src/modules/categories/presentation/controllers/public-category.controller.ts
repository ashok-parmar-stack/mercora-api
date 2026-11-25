import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { ListCategoriesUseCase } from "../../application/use-cases/list-categories/list-categories.use-case";
import { GetCategoryUseCase } from "../../application/use-cases/get-category/get-category.use-case";
import { CategoryQueryDto } from "../dto/category-query.dto";
import { API_HEADERS } from "../../../../config/headers.config";
import { Public } from "../../../../common";

@ApiTags(API_HEADERS.modules.categories.tag)
@Public()
@Controller("categories")
export class PublicCategoryController {
  constructor(
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
    private readonly getCategoryUseCase: GetCategoryUseCase
  ) {}

  @Get()
  @ApiOperation({ summary: "List active product/master categories and counts" })
  async list(@Query() query: CategoryQueryDto) {
    return this.listCategoriesUseCase.execute(query);
  }

  @Get(":slug")
  @ApiOperation({ summary: "Get single category details by slug or ID" })
  async getBySlug(@Param("slug") slug: string) {
    return this.getCategoryUseCase.execute(slug);
  }
}

@ApiTags("Master Categories")
@Public()
@Controller("master-categories")
export class PublicMasterCategoryAliasController extends PublicCategoryController {}

