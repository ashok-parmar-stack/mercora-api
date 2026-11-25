import { Controller, Get, Param, Query, Post, Body, Req, HttpCode, HttpStatus, Inject } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { Request } from "express";
import { ListBusinessesUseCase } from "../../application/use-cases/list-businesses/list-businesses.use-case";
import { GetBusinessUseCase } from "../../application/use-cases/get-business/get-business.use-case";
import { CreateBusinessUseCase } from "../../application/use-cases/create-business/create-business.use-case";
import { CreateBusinessDto } from "../../application/use-cases/create-business/create-business.dto";
import { BusinessQueryDto } from "../../application/dto/business-query.dto";
import { CreateBusinessEnquiryDto } from "../../application/dto/create-enquiry.dto";
import { BusinessResponseDto } from "../../application/dto/business-response.dto";
import { BusinessEnquiryEntity } from "../../../../database/entities/business-enquiry.entity";
import { API_HEADERS } from "../../../../config/headers.config";
import { API_MESSAGES } from "../../../../common/messages";
import { IBusinessRepository, BUSINESS_REPOSITORY_TOKEN } from "../../domain/repositories/business.repository.interface";
import { Public, Roles, BUSINESS_WRITE_ROLES } from "../../../../common";

@ApiTags(API_HEADERS.modules.businesses.tag)
@Controller("businesses")
export class PublicBusinessController {
  constructor(
    private readonly listBusinessesUseCase: ListBusinessesUseCase,
    private readonly getBusinessUseCase: GetBusinessUseCase,
    private readonly createBusinessUseCase: CreateBusinessUseCase,
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository,
    @InjectRepository(BusinessEnquiryEntity)
    private readonly enquiryRepo: Repository<BusinessEnquiryEntity>,
  ) {}

  @Post()
  @Roles(...BUSINESS_WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Add / register a new verified business" })
  @ApiResponse({ status: 201, description: "Business created successfully" })
  async create(@Body() dto: CreateBusinessDto) {
    return this.createBusinessUseCase.execute(dto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: "List verified B2B businesses with filters, pagination, and sorting" })
  @ApiResponse({ status: 200, description: "Paginated list of verified businesses" })
  async list(@Query() query: BusinessQueryDto) {
    return this.listBusinessesUseCase.execute(query);
  }

  @Get("featured")
  @Public()
  @ApiOperation({ summary: "Get featured top-tier verified businesses" })
  async getFeatured(@Query("limit") limit?: number) {
    const featured = await this.businessRepository.findFeatured(limit ? Number(limit) : 6);
    return featured.map((b) => BusinessResponseDto.fromDomain(b));
  }

  @Get(":slug")
  @Public()
  @ApiOperation({ summary: "Get complete business profile and catalog by unique slug or ID" })
  @ApiResponse({ status: 200, description: "Detailed business entity with products and contacts" })
  @ApiResponse({ status: 404, description: "Business not found" })
  async getBySlug(@Param("slug") slug: string) {
    return this.getBusinessUseCase.execute(slug);
  }

  @Post("enquiries")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Submit commercial inquiry / RFQ directly to a business" })
  async submitEnquiry(@Body() dto: CreateBusinessEnquiryDto, @Req() req: Request) {
    const saved = await this.enquiryRepo.save(
      this.enquiryRepo.create({
        businessId: dto.businessId.trim(),
        businessName: dto.businessName?.trim(),
        senderName: dto.name.trim(),
        senderEmail: dto.email?.trim().toLowerCase(),
        senderPhone: dto.phone.trim(),
        companyName: dto.company?.trim(),
        message: dto.message.trim(),
        status: "NEW",
        source: dto.source || "DIRECTORY_RFQ",
        ipAddress: req.ip,
      }),
    );

    return {
      success: true,
      message: API_MESSAGES.businesses.inquiryReceived,
      id: saved.id,
      receivedAt: saved.createdAt.toISOString(),
      businessId: saved.businessId,
    };
  }
}
