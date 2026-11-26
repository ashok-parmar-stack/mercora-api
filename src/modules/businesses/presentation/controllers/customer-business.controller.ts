import { Controller, Post, Body, Put, Param, Inject, ForbiddenException, NotFoundException, Req } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { CreateBusinessUseCase } from "../../application/use-cases/create-business/create-business.use-case";
import { UpdateBusinessUseCase } from "../../application/use-cases/update-business/update-business.use-case";
import { CreateBusinessDto } from "../../application/use-cases/create-business/create-business.dto";
import { UpdateBusinessDto } from "../../application/use-cases/update-business/update-business.dto";
import { API_HEADERS } from "../../../../config/headers.config";
import { API_MESSAGES } from "../../../../common/messages";
import { Roles, BUSINESS_WRITE_ROLES, CATALOG_ADMIN_ROLES } from "../../../../common";
import { IBusinessRepository, BUSINESS_REPOSITORY_TOKEN } from "../../domain/repositories/business.repository.interface";

@ApiTags(API_HEADERS.modules.businesses.tag)
@Roles(...BUSINESS_WRITE_ROLES)
@Controller("customer/businesses")
export class CustomerBusinessController {
  constructor(
    private readonly createBusinessUseCase: CreateBusinessUseCase,
    private readonly updateBusinessUseCase: UpdateBusinessUseCase,
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository
  ) {}

  @Post()
  @ApiOperation({ summary: "Register new business vendor profile" })
  async create(@Body() dto: CreateBusinessDto) {
    return this.createBusinessUseCase.execute(dto);
  }

  @Put(":id")
  @ApiOperation({ summary: "Update own business profile and contact information" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateBusinessDto,
    @Req() req: { user?: { userId?: string; email?: string; role?: string } }
  ) {
    const user = req?.user;
    const isAdmin = Boolean(
      user?.role && (CATALOG_ADMIN_ROLES as readonly string[]).includes(user.role.toUpperCase())
    );
    if (!isAdmin) {
      const existing = await this.businessRepository.findById(id);
      if (!existing) {
        throw new NotFoundException(API_MESSAGES.businesses.notFound);
      }
      if (!user?.email || existing.email?.toLowerCase() !== user.email.toLowerCase()) {
        throw new ForbiddenException("You do not have permission to update this business.");
      }
    }
    return this.updateBusinessUseCase.execute(id, dto);
  }
}
