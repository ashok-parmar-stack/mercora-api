import { Controller, Get, Param, Query, Post, Body, Req, HttpCode, HttpStatus, Inject, NotFoundException, Optional } from "@nestjs/common";
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
import { Public, Roles, BUSINESS_WRITE_ROLES, CATALOG_ADMIN_ROLES } from "../../../../common";
import { SubscriptionEntitlementService } from "../../../subscriptions/services/subscription-entitlement.service";

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
    @Optional()
    private readonly entitlementService?: SubscriptionEntitlementService,
  ) {}

  @Post()
  @Roles(...BUSINESS_WRITE_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Add / register a new verified business" })
  @ApiResponse({ status: 201, description: "Business created successfully" })
  async create(
    @Body() dto: CreateBusinessDto,
    @Req() req?: { user?: { id?: string; userId?: string; email?: string; role?: string } },
  ) {
    const userId = req?.user?.id || req?.user?.userId;
    const isAdmin = Boolean(
      req?.user?.role &&
        (CATALOG_ADMIN_ROLES as readonly string[]).includes(req.user.role.toUpperCase()),
    );
    return this.createBusinessUseCase.execute(dto, userId, {
      bypassSubscriptionLimits: isAdmin,
      ownerEmail: req?.user?.email,
    });
  }

  @Get()
  @Public()
  @ApiOperation({ summary: "List verified B2B businesses with filters, pagination, and sorting" })
  @ApiResponse({ status: 200, description: "Paginated list of verified businesses" })
  async list(@Query() query: BusinessQueryDto) {
    return this.listBusinessesUseCase.execute({ ...query, verifiedOnly: true });
  }

  @Get("featured")
  @Public()
  @ApiOperation({ summary: "Get featured top-tier verified businesses" })
  async getFeatured(@Query("limit") limit?: number) {
    const safeLimit = limit ? Number(limit) : 6;
    const [featured, entitledIds] = await Promise.all([
      this.businessRepository.findFeatured(safeLimit * 2),
      this.entitlementService
        ? this.entitlementService.getFeaturedEntitledBusinessIds().catch(() => [])
        : Promise.resolve([] as string[]),
    ]);
    const entitledSet = new Set(entitledIds);
    const prioritized = [
      ...featured.filter((b) => entitledSet.has(b.id)),
      ...featured.filter((b) => !entitledSet.has(b.id)),
    ].slice(0, safeLimit);

    return prioritized.map((b) => ({
      ...BusinessResponseDto.fromDomain(b),
      isFeaturedSubscription: entitledSet.has(b.id),
    }));
  }

  @Get("facets")
  @Public()
  @ApiOperation({ summary: "Get live dynamic counts for directory categories, locations, and verification status" })
  @ApiResponse({ status: 200, description: "Dynamic directory filter facets" })
  async getFacets(@Query() query: BusinessQueryDto) {
    return this.businessRepository.getDirectoryFacets({ ...query, verifiedOnly: true });
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
    const targetId = dto.businessId.trim();
    const business =
      (await this.businessRepository.findById(targetId)) ||
      (await this.businessRepository.findBySlug(targetId));
    if (!business) {
      throw new NotFoundException(API_MESSAGES.businesses.notFound);
    }

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
