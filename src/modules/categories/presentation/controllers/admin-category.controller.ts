import { Controller, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { CreateCategoryUseCase } from "../../application/use-cases/create-category/create-category.use-case";
import { UpdateCategoryUseCase } from "../../application/use-cases/update-category/update-category.use-case";
import { DeleteCategoryUseCase } from "../../application/use-cases/delete-category/delete-category.use-case";
import { CreateCategoryRequestDto } from "../dto/create-category.request.dto";
import { UpdateCategoryRequestDto } from "../dto/update-category.request.dto";
import { API_HEADERS } from "../../../../config/headers.config";

@ApiTags(API_HEADERS.modules.categories.tag)
@Controller("admin/categories")
export class AdminCategoryController {
  constructor(
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly updateCategoryUseCase: UpdateCategoryUseCase,
    private readonly deleteCategoryUseCase: DeleteCategoryUseCase
  ) {}

  @Post()
  @ApiOperation({ summary: "Create new product category" })
  async create(@Body() dto: CreateCategoryRequestDto) {
    return this.createCategoryUseCase.execute(dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Update category metadata, display order, or status" })
  async update(@Param("id") id: string, @Body() dto: UpdateCategoryRequestDto) {
    return this.updateCategoryUseCase.execute(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete product category (if no children exist)" })
  async delete(@Param("id") id: string) {
    await this.deleteCategoryUseCase.execute(id);
  }
}
