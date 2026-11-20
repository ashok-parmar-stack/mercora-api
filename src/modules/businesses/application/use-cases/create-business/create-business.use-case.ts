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
import { API_MESSAGES } from "../../../../../config/messages.config";

@Injectable()
export class CreateBusinessUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository
  ) {}

  async execute(dto: CreateBusinessDto): Promise<BusinessResponseDto> {
    const slug = dto.slug || dto.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const existing = await this.businessRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictException(API_MESSAGES.businesses.slugExists);
    }

    const business = new BusinessEntity(
      `biz-${Date.now()}`,
      dto.name,
      slug,
      dto.category,
      dto.businessType,
      dto.category,
      dto.city,
      dto.state,
      "380001",
      dto.description || "",
      new BusinessRating(4.5, 1),
      dto.establishedYear || new Date().getFullYear(),
      "10-50",
      VerificationStatus.VERIFIED,
      dto.phone || "+91 98765 00000",
      dto.email || "info@business.example.com",
      dto.website || "www.business.example.com",
      dto.address || `${dto.city}, ${dto.state}`,
      dto.gstin || "24AAAAA0000A1Z5",
      "U00000GJ2025PTC000000",
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80",
      dto.description,
      [],
      undefined,
      new Date(),
      new Date()
    );

    const saved = await this.businessRepository.save(business);
    return BusinessResponseDto.fromDomain(saved);
  }
}
