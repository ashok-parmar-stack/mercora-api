import { Controller, Post, Body, Put, Param } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { CreateBusinessUseCase } from "../../application/use-cases/create-business/create-business.use-case";
import { UpdateBusinessUseCase } from "../../application/use-cases/update-business/update-business.use-case";
import { CreateBusinessDto } from "../../application/use-cases/create-business/create-business.dto";
import { UpdateBusinessDto } from "../../application/use-cases/update-business/update-business.dto";
import { API_HEADERS } from "../../../../config/headers.config";
import { Roles, BUSINESS_WRITE_ROLES } from "../../../../common";

@ApiTags(API_HEADERS.modules.businesses.tag)
@Roles(...BUSINESS_WRITE_ROLES)
@Controller("customer/businesses")
export class CustomerBusinessController {
  constructor(
    private readonly createBusinessUseCase: CreateBusinessUseCase,
    private readonly updateBusinessUseCase: UpdateBusinessUseCase
  ) {}

  @Post()
  @ApiOperation({ summary: "Register new business vendor profile" })
  async create(@Body() dto: CreateBusinessDto) {
    return this.createBusinessUseCase.execute(dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Update own business profile and contact information" })
  async update(@Param("id") id: string, @Body() dto: UpdateBusinessDto) {
    return this.updateBusinessUseCase.execute(id, dto);
  }
}
