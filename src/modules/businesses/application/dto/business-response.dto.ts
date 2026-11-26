import { BusinessEntity } from '../../domain/entities/business.entity';

export class BusinessResponseDto {
  static fromDomain(entity: BusinessEntity) {
    return {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      logoUrl: entity.logoUrl,
      imageUrl: entity.imageUrl,
      category: entity.category,
      businessType: entity.businessType,
      industry: entity.industry,
      city: entity.city,
      state: entity.state,
      pincode: entity.pincode,
      description: entity.description,
      fullOverview: entity.fullOverview,
      rating: entity.rating.score,
      reviewCount: entity.rating.reviewCount,
      establishedYear: entity.establishedYear,
      employeeCount: entity.employeeCount,
      isVerified: entity.isVerified,
      tier: entity.verificationStatus,
      phone: entity.phone,
      email: entity.email,
      website: entity.website,
      address: entity.address,
      gstin: entity.gstin,
      cin: entity.cin,
      products: entity.products,
      contacts: entity.contacts || [],
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  static fromDomainList(entities: BusinessEntity[]) {
    return entities.map((e) => this.fromDomain(e));
  }
}
