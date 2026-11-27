import { Injectable, Inject, NotFoundException, ConflictException } from "@nestjs/common";
import {
  IBusinessRepository,
  BUSINESS_REPOSITORY_TOKEN,
} from "../../../domain/repositories/business.repository.interface";
import { UpdateBusinessDto } from "./update-business.dto";
import { BusinessResponseDto } from "../../dto/business-response.dto";
import { API_MESSAGES } from "../../../../../common/messages";
import { toSlug } from "../../../../../common/services/slug.util";

@Injectable()
export class UpdateBusinessUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository
  ) {}

  async execute(id: string, dto: UpdateBusinessDto): Promise<BusinessResponseDto> {
    const existing = await this.businessRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(API_MESSAGES.businesses.notFound);
    }

    if (dto.name) existing.name = dto.name;
    if (dto.slug !== undefined) {
      const normalized = dto.slug.trim() ? toSlug(dto.slug) : "";
      if (normalized && normalized !== existing.slug) {
        const collision = await this.businessRepository.findBySlug(normalized);
        if (collision && collision.id !== existing.id) {
          throw new ConflictException(API_MESSAGES.businesses.slugExists);
        }
        existing.slug = normalized;
      }
    }
    if (dto.category) existing.category = dto.category;
    if (dto.businessType) existing.businessType = dto.businessType;
    if (dto.city) existing.city = dto.city;
    if (dto.state) existing.state = dto.state;
    if (dto.pincode !== undefined) existing.pincode = dto.pincode;
    if (dto.description !== undefined) existing.description = dto.description;
    if (dto.fullOverview !== undefined) existing.fullOverview = dto.fullOverview;
    if (dto.establishedYear !== undefined) existing.establishedYear = dto.establishedYear;
    if (dto.employeeCount !== undefined) existing.employeeCount = dto.employeeCount;
    if (dto.logoUrl !== undefined) existing.logoUrl = dto.logoUrl;
    if (dto.imageUrl !== undefined) existing.imageUrl = dto.imageUrl;
    if (dto.phone) existing.phone = dto.phone;
    if (dto.email) existing.email = dto.email;
    if (dto.website) existing.website = dto.website;
    if (dto.address) existing.address = dto.address;
    if (dto.gstin !== undefined) existing.gstin = dto.gstin;
    if (dto.pan !== undefined) existing.pan = dto.pan;
    if (dto.cin !== undefined) existing.cin = dto.cin;
    if (dto.verificationStatus) existing.verificationStatus = dto.verificationStatus;
    if (Array.isArray(dto.contacts)) {
      const normalized = dto.contacts
        .filter((c) => c && typeof c.phone === "string" && c.phone.trim().length > 0)
        .map((c, idx) => ({
          id: c.id?.trim() || `cnt-${Date.now()}-${idx}`,
          role: (c.role || "Seller").trim(),
          name: c.name?.trim() || undefined,
          phone: c.phone.trim(),
          email: c.email?.trim() || undefined,
          isPrimary: Boolean(c.isPrimary),
        }));
      if (normalized.length > 0 && !normalized.some((c) => c.isPrimary)) {
        normalized[0].isPrimary = true;
      }
      existing.contacts = normalized;
      const primary = normalized.find((c) => c.isPrimary) || normalized[0];
      if (primary && !dto.phone) {
        existing.phone = primary.phone;
      }
    }

    const saved = await this.businessRepository.save(existing, dto.categoryIds);
    return BusinessResponseDto.fromDomain(saved);
  }
}
