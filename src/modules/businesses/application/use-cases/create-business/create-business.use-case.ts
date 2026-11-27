import { Injectable, Inject, ConflictException, Optional } from "@nestjs/common";
import {
  IBusinessRepository,
  BUSINESS_REPOSITORY_TOKEN,
} from "../../../domain/repositories/business.repository.interface";
import { CreateBusinessDto } from "./create-business.dto";
import { BusinessEntity, BusinessContactItem } from "../../../domain/entities/business.entity";
import { BusinessRating } from "../../../domain/value-objects/business-rating.vo";
import { BusinessResponseDto } from "../../dto/business-response.dto";
import { VerificationStatus } from "../../../domain/enums/verification-status.enum";
import { BusinessType } from "../../../domain/enums/business-type.enum";
import { API_MESSAGES } from "../../../../../common/messages";
import { toSlug, toUniqueSlug } from "../../../../../common/services/slug.util";
import { SubscriptionEntitlementService } from "../../../../subscriptions/services/subscription-entitlement.service";
import { DEFAULT_FREE_PLAN_LIMITS } from "../../../../subscriptions/subscription.constants";
import { ForbiddenException } from "@nestjs/common";

@Injectable()
export class CreateBusinessUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository,
    @Optional()
    private readonly entitlementService?: SubscriptionEntitlementService,
  ) { }

  async execute(
    dto: CreateBusinessDto,
    ownerUserId?: string,
    options?: { bypassSubscriptionLimits?: boolean; ownerEmail?: string },
  ): Promise<BusinessResponseDto> {
    if (ownerUserId && !options?.bypassSubscriptionLimits && this.entitlementService) {
      await this.entitlementService.assertCanCreateBusiness(
        ownerUserId,
        options?.ownerEmail || dto.email,
      );
    }
    const customSlug = dto.slug?.trim() ? toSlug(dto.slug) : "";
    let slug = customSlug || toSlug(dto.name) || "business";
    const existing = await this.businessRepository.findBySlug(slug);
    if (existing) {
      if (customSlug) {
        throw new ConflictException(API_MESSAGES.businesses.slugExists);
      }
      slug = toUniqueSlug(slug);
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
    const rawContacts = Array.isArray(dto.contacts) ? dto.contacts : [];
    const contacts: BusinessContactItem[] = rawContacts
      .filter((c) => c && typeof c.phone === "string" && c.phone.trim().length > 0)
      .map((c, idx) => ({
        id: c.id?.trim() || `cnt-${Date.now()}-${idx}`,
        role: (c.role || "Seller").trim(),
        name: c.name?.trim() || undefined,
        phone: c.phone.trim(),
        email: c.email?.trim() || undefined,
        isPrimary: Boolean(c.isPrimary),
      }));
    if (contacts.length > 0 && !contacts.some((c) => c.isPrimary)) {
      contacts[0].isPrimary = true;
    }
    const primaryContact = contacts.find((c) => c.isPrimary) || contacts[0];

    const pincode = dto.pincode || "380001";
    const phone = dto.phone || primaryContact?.phone || "+91 98765 00000";
    const email = dto.email || primaryContact?.email || `info@${slug}.example.com`;
    const website = dto.website || `www.${slug}.com`;
    const address = dto.address || `${dto.city}, ${dto.state}`;
    const gstin = dto.gstin || "24AAAAA0000A1Z5";
    const pan = dto.pan || (gstin.length === 15 ? gstin.slice(2, 12) : "");
    const cin = dto.cin || "U00000GJ2025PTC000000";
    const id = dto.id || `biz-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const products = dto.products || [];

    if (ownerUserId && !options?.bypassSubscriptionLimits && this.entitlementService) {
      if (products.length > DEFAULT_FREE_PLAN_LIMITS.maxProducts) {
        const owned = await this.entitlementService.findOwnedBusinesses(
          ownerUserId,
          options?.ownerEmail || dto.email,
        );
        let maxProd = DEFAULT_FREE_PLAN_LIMITS.maxProducts;
        for (const ob of owned) {
          const ent = await this.entitlementService.getBusinessEntitlements(ob.id);
          if (ent.limits.maxProducts < 0) {
            maxProd = -1;
            break;
          }
          if (ent.limits.maxProducts > maxProd) maxProd = ent.limits.maxProducts;
        }
        if (maxProd >= 0 && products.length > maxProd) {
          throw new ForbiddenException(
            `Your current plan allows up to ${maxProd} product(s) per business. Upgrade your subscription to add more products.`,
          );
        }
      }
      if (contacts.length > DEFAULT_FREE_PLAN_LIMITS.maxContacts) {
        const owned = await this.entitlementService.findOwnedBusinesses(
          ownerUserId,
          options?.ownerEmail || dto.email,
        );
        let maxCnt = DEFAULT_FREE_PLAN_LIMITS.maxContacts;
        for (const ob of owned) {
          const ent = await this.entitlementService.getBusinessEntitlements(ob.id);
          if (ent.limits.maxContacts < 0) {
            maxCnt = -1;
            break;
          }
          if (ent.limits.maxContacts > maxCnt) maxCnt = ent.limits.maxContacts;
        }
        if (maxCnt >= 0 && contacts.length > maxCnt) {
          throw new ForbiddenException(
            `Your current plan allows up to ${maxCnt} contact channel(s). Upgrade your subscription to add more contacts.`,
          );
        }
      }
    }

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
      new Date(),
      contacts,
      pan,
      ownerUserId ?? null
    );

    const saved = await this.businessRepository.save(business, dto.categoryIds);
    return BusinessResponseDto.fromDomain(saved);
  }
}
