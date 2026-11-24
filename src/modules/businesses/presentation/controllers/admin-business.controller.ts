import { Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ListBusinessesUseCase } from "../../application/use-cases/list-businesses/list-businesses.use-case";
import { ChangeBusinessStatusUseCase } from "../../application/use-cases/change-business-status/change-business-status.use-case";
import { DeleteBusinessUseCase } from "../../application/use-cases/delete-business/delete-business.use-case";
import { CreateBusinessUseCase } from "../../application/use-cases/create-business/create-business.use-case";
import { CreateBusinessDto } from "../../application/use-cases/create-business/create-business.dto";
import { ChangeBusinessStatusDto } from "../../application/use-cases/change-business-status/change-business-status.dto";
import { BusinessQueryDto } from "../../application/dto/business-query.dto";
import { API_HEADERS } from "../../../../config/headers.config";

@ApiTags(API_HEADERS.modules.businesses.tag)
@Controller("admin/businesses")
export class AdminBusinessController {
  constructor(
    private readonly listBusinessesUseCase: ListBusinessesUseCase,
    private readonly changeBusinessStatusUseCase: ChangeBusinessStatusUseCase,
    private readonly deleteBusinessUseCase: DeleteBusinessUseCase,
    private readonly createBusinessUseCase: CreateBusinessUseCase
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Admin add new business profile" })
  @ApiResponse({ status: 201, description: "Business created successfully" })
  async create(@Body() dto: CreateBusinessDto) {
    return this.createBusinessUseCase.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: "Admin list all businesses including unverified and deactivated" })
  async listAll(@Query() query: BusinessQueryDto) {
    return this.listBusinessesUseCase.execute(query);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Change business verification tier or status" })
  async changeStatus(@Param("id") id: string, @Body() dto: ChangeBusinessStatusDto) {
    return this.changeBusinessStatusUseCase.execute(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete business profile and associated data" })
  async delete(@Param("id") id: string) {
    await this.deleteBusinessUseCase.execute(id);
  }
}
