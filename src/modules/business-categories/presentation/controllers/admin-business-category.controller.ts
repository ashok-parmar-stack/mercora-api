import { Controller, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { CreateBusinessCategoryUseCase } from "../../application/use-cases/create-business-category.use-case";
import { UpdateBusinessCategoryUseCase } from "../../application/use-cases/update-business-category.use-case";
import { DeleteBusinessCategoryUseCase } from "../../application/use-cases/delete-business-category.use-case";
import { CreateBusinessCategoryDto } from "../../application/dto/create-business-category.dto";
import { UpdateBusinessCategoryDto } from "../../application/dto/update-business-category.dto";

@ApiTags("Business Categories / Types Master (Admin)")
@Controller("admin/business-categories")
export class AdminBusinessCategoryController {
  constructor(
    private readonly createUseCase: CreateBusinessCategoryUseCase,
    private readonly updateUseCase: UpdateBusinessCategoryUseCase,
    private readonly deleteUseCase: DeleteBusinessCategoryUseCase
  ) {}

  @Post()
  @ApiOperation({ summary: "Create new business category / type (e.g. Export, Seller, Manufacture)" })
  async create(@Body() dto: CreateBusinessCategoryDto) {
    return this.createUseCase.execute(dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Update business category metadata, icon, or order" })
  async update(@Param("id") id: string, @Body() dto: UpdateBusinessCategoryDto) {
    return this.updateUseCase.execute(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete business category" })
  async delete(@Param("id") id: string) {
    await this.deleteUseCase.execute(id);
  }
}
