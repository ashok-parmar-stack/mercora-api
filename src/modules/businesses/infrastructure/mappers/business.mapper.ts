import { BusinessEntity } from '../../domain/entities/business.entity';
import { BusinessOrmEntity } from '../persistence/entities/business-orm.entity';
import { BusinessRating } from '../../domain/value-objects/business-rating.vo';
import { BusinessType } from '../../domain/enums/business-type.enum';
import { VerificationStatus } from '../../domain/enums/verification-status.enum';

export class BusinessMapper {
  static toDomain(orm: BusinessOrmEntity): BusinessEntity {
    return new BusinessEntity(
      orm.id,
      orm.name,
      orm.slug,
      orm.category,
      orm.business_type as BusinessType,
      orm.industry,
      orm.city,
      orm.state,
      orm.pincode,
      orm.description,
      new BusinessRating(orm.rating || 0, orm.review_count || 0),
      orm.established_year,
      orm.employee_count,
      (orm.verification_status as VerificationStatus) || VerificationStatus.VERIFIED,
      orm.phone,
      orm.email,
      orm.website,
      orm.address,
      orm.gstin,
      orm.cin,
      orm.image_url,
      orm.full_overview,
      orm.products || [],
      orm.logo_url,
      orm.created_at,
      orm.updated_at,
      orm.contacts || []
    );
  }

  static toDomainList(orms: BusinessOrmEntity[]): BusinessEntity[] {
    return orms.map((orm) => this.toDomain(orm));
  }

  static toOrm(domain: BusinessEntity): BusinessOrmEntity {
    const orm = new BusinessOrmEntity();
    orm.id = domain.id;
    orm.name = domain.name;
    orm.slug = domain.slug;
    orm.logo_url = domain.logoUrl || '';
    orm.image_url = domain.imageUrl;
    orm.category = domain.category;
    orm.business_type = domain.businessType;
    orm.industry = domain.industry;
    orm.city = domain.city;
    orm.state = domain.state;
    orm.pincode = domain.pincode;
    orm.description = domain.description;
    orm.full_overview = domain.fullOverview || '';
    orm.rating = domain.rating.score;
    orm.review_count = domain.rating.reviewCount;
    orm.established_year = domain.establishedYear;
    orm.employee_count = domain.employeeCount;
    orm.verification_status = domain.verificationStatus;
    orm.phone = domain.phone;
    orm.email = domain.email;
    orm.contacts = domain.contacts || [];
    orm.website = domain.website;
    orm.address = domain.address;
    orm.gstin = domain.gstin;
    orm.cin = domain.cin;
    orm.products = domain.products;
    return orm;
  }
}
