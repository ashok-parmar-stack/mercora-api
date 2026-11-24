import { Controller, Get, Param, Query, Post, Body, HttpCode, HttpStatus, Inject } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ListBusinessesUseCase } from "../../application/use-cases/list-businesses/list-businesses.use-case";
import { GetBusinessUseCase } from "../../application/use-cases/get-business/get-business.use-case";
import { CreateBusinessUseCase } from "../../application/use-cases/create-business/create-business.use-case";
import { CreateBusinessDto } from "../../application/use-cases/create-business/create-business.dto";
import { BusinessQueryDto } from "../../application/dto/business-query.dto";
import { BusinessResponseDto } from "../../application/dto/business-response.dto";
import { API_HEADERS } from "../../../../config/headers.config";
import { API_MESSAGES } from "../../../../config/messages.config";
import { IBusinessRepository, BUSINESS_REPOSITORY_TOKEN } from "../../domain/repositories/business.repository.interface";

@ApiTags(API_HEADERS.modules.businesses.tag)
@Controller("businesses")
export class PublicBusinessController {
  constructor(
    private readonly listBusinessesUseCase: ListBusinessesUseCase,
    private readonly getBusinessUseCase: GetBusinessUseCase,
    private readonly createBusinessUseCase: CreateBusinessUseCase,
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Add / register a new verified business" })
  @ApiResponse({ status: 201, description: "Business created successfully" })
  async create(@Body() dto: CreateBusinessDto) {
    return this.createBusinessUseCase.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: "List verified B2B businesses with filters, pagination, and sorting" })
  @ApiResponse({ status: 200, description: "Paginated list of verified businesses" })
  async list(@Query() query: BusinessQueryDto) {
    return this.listBusinessesUseCase.execute(query);
  }

  @Get("featured")
  @ApiOperation({ summary: "Get featured top-tier verified businesses" })
  async getFeatured(@Query("limit") limit?: number) {
    const featured = await this.businessRepository.findFeatured(limit ? Number(limit) : 6);
    return featured.map((b) => BusinessResponseDto.fromDomain(b));
  }

  @Get(":slug")
  @ApiOperation({ summary: "Get complete business profile and catalog by unique slug or ID" })
  @ApiResponse({ status: 200, description: "Detailed business entity with products and contacts" })
  @ApiResponse({ status: 404, description: "Business not found" })
  async getBySlug(@Param("slug") slug: string) {
    return this.getBusinessUseCase.execute(slug);
  }

  @Post("enquiries")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Submit commercial inquiry / RFQ directly to a business" })
  async submitEnquiry(@Body() body: any) {
    return {
      success: true,
      message: API_MESSAGES.businesses.inquiryReceived,
      receivedAt: new Date().toISOString(),
      businessId: body.businessId,
    };
  }
}
