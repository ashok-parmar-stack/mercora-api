import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ListBusinessCategoriesUseCase } from "../../application/use-cases/list-business-categories.use-case";
import { GetBusinessCategoryUseCase } from "../../application/use-cases/get-business-category.use-case";
import { GetBusinessCategoryTreeUseCase } from "../../application/use-cases/get-business-category-tree.use-case";
import { CreateBusinessCategoryUseCase } from "../../application/use-cases/create-business-category.use-case";
import { UpdateBusinessCategoryUseCase } from "../../application/use-cases/update-business-category.use-case";
import { DeleteBusinessCategoryUseCase } from "../../application/use-cases/delete-business-category.use-case";
import { CreateBusinessCategoryDto } from "../../application/dto/create-business-category.dto";
import { UpdateBusinessCategoryDto } from "../../application/dto/update-business-category.dto";
import { BusinessCategoryQueryDto } from "../../application/dto/business-category-query.dto";
import {
  IBusinessCategoryRepository,
  BUSINESS_CATEGORY_REPOSITORY_TOKEN,
} from "../../domain/repositories/business-category.repository.interface";
import { Roles, CATALOG_ADMIN_ROLES } from "../../../../common";

@ApiTags("Business Categories / Types Master (Admin)")
@Roles(...CATALOG_ADMIN_ROLES)
@Controller("admin/business-categories")
export class AdminBusinessCategoryController {
  constructor(
    private readonly listUseCase: ListBusinessCategoriesUseCase,
    private readonly getUseCase: GetBusinessCategoryUseCase,
    private readonly treeUseCase: GetBusinessCategoryTreeUseCase,
    private readonly createUseCase: CreateBusinessCategoryUseCase,
    private readonly updateUseCase: UpdateBusinessCategoryUseCase,
    private readonly deleteUseCase: DeleteBusinessCategoryUseCase,
    @Inject(BUSINESS_CATEGORY_REPOSITORY_TOKEN)
    private readonly categoryRepo: IBusinessCategoryRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: "List all business categories for admin panel (with filtering & pagination)" })
  async list(@Query() query: BusinessCategoryQueryDto) {
    return this.listUseCase.execute(query);
  }

  @Get("tree")
  @ApiOperation({ summary: "Get hierarchical tree of business categories with nested subcategories" })
  async getTree() {
    return this.treeUseCase.execute();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get single business category details by ID, slug, or code" })
  async getOne(@Param("id") id: string) {
    return this.getUseCase.execute(id);
  }

  @Post()
  @ApiOperation({ summary: "Create new business category or subcategory" })
  async create(@Body() dto: CreateBusinessCategoryDto) {
    return this.createUseCase.execute(dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Update business category metadata, icon, order, or parent" })
  async update(@Param("id") id: string, @Body() dto: UpdateBusinessCategoryDto) {
    return this.updateUseCase.execute(id, dto);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Toggle business category active/inactive status" })
  async toggleStatus(
    @Param("id") id: string,
    @Body("isActive") isActive: boolean
  ) {
    return this.updateUseCase.execute(id, { isActive });
  }

  @Patch("order")
  @ApiOperation({ summary: "Bulk update category display orders inside a single transaction" })
  async updateOrder(
    @Body() items: Array<{ id: string; displayOrder: number }>
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException("Order items array is required.");
    }
    await this.categoryRepo.bulkUpdateOrder(items);
    return {
      success: true,
      updatedCount: items.length,
    };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete business category with dependency checks" })
  async delete(@Param("id") id: string) {
    await this.deleteUseCase.execute(id);
  }
}
