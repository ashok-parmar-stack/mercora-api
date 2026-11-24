import { Injectable, Inject, ConflictException } from "@nestjs/common";
import {
  IBusinessRepository,
  BUSINESS_REPOSITORY_TOKEN,
} from "../../../domain/repositories/business.repository.interface";
import { CreateBusinessDto } from "./create-business.dto";
import { BusinessEntity } from "../../../domain/entities/business.entity";
import { BusinessRating } from "../../../domain/value-objects/business-rating.vo";
import { BusinessResponseDto } from "../../dto/business-response.dto";
import { VerificationStatus } from "../../../domain/enums/verification-status.enum";
import { BusinessType } from "../../../domain/enums/business-type.enum";
import { API_MESSAGES } from "../../../../../config/messages.config";

@Injectable()
export class CreateBusinessUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository
  ) {}

  async execute(dto: CreateBusinessDto): Promise<BusinessResponseDto> {
    const slug = (dto.slug || dto.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-+|-+$/g, "");
    const existing = await this.businessRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictException(API_MESSAGES.businesses.slugExists);
    }

    const businessType = dto.businessType || dto.business_type || BusinessType.MANUFACTURER;
    const industry = dto.industry || dto.category;
    const imageUrl =
      dto.imageUrl ||
      dto.image_url ||
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80";
    const logoUrl = dto.logoUrl || dto.logo_url;
    const fullOverview = dto.fullOverview || dto.full_overview || dto.description;
    const establishedYear = dto.establishedYear || dto.established_year || new Date().getFullYear();
    const employeeCount = dto.employeeCount || dto.employee_count || "10-50";
    const ratingScore = dto.rating !== undefined ? Number(dto.rating) : 4.5;
    const reviewCount =
      dto.reviewCount !== undefined
        ? Number(dto.reviewCount)
        : dto.review_count !== undefined
        ? Number(dto.review_count)
        : 0;
    const verificationStatus = (dto.verificationStatus ||
      dto.verification_status ||
      dto.tier ||
      VerificationStatus.VERIFIED) as VerificationStatus;
    const pincode = dto.pincode || "380001";
    const phone = dto.phone || "+91 98765 00000";
    const email = dto.email || `info@${slug}.example.com`;
    const website = dto.website || `www.${slug}.com`;
    const address = dto.address || `${dto.city}, ${dto.state}`;
    const gstin = dto.gstin || "24AAAAA0000A1Z5";
    const cin = dto.cin || "U00000GJ2025PTC000000";
    const id = dto.id || `biz-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const products = dto.products || [];

    const business = new BusinessEntity(
      id,
      dto.name,
      slug,
      dto.category,
      businessType,
      industry,
      dto.city,
      dto.state,
      pincode,
      dto.description || fullOverview || "",
      new BusinessRating(ratingScore, reviewCount),
      establishedYear,
      employeeCount,
      verificationStatus,
      phone,
      email,
      website,
      address,
      gstin,
      cin,
      imageUrl,
      fullOverview,
      products,
      logoUrl,
      new Date(),
      new Date()
    );

    const saved = await this.businessRepository.save(business);
    return BusinessResponseDto.fromDomain(saved);
  }
}
