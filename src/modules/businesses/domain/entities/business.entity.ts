import { BusinessType } from '../enums/business-type.enum';
import { VerificationStatus } from '../enums/verification-status.enum';
import { BusinessRating } from '../value-objects/business-rating.vo';

export interface BusinessProductItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  description?: string;
}

export class BusinessEntity {
  constructor(
    public readonly id: string,
    public name: string,
    public slug: string,
    public category: string,
    public businessType: BusinessType | string,
    public industry: string,
    public city: string,
    public state: string,
    public pincode: string,
    public description: string,
    public rating: BusinessRating,
    public establishedYear: number,
    public employeeCount: string,
    public verificationStatus: VerificationStatus,
    public phone: string,
    public email: string,
    public website: string,
    public address: string,
    public gstin: string,
    public cin: string,
    public imageUrl: string,
    public fullOverview?: string,
    public products: BusinessProductItem[] = [],
    public logoUrl?: string,
    public createdAt?: Date,
    public updatedAt?: Date
  ) {}

  public get isVerified(): boolean {
    return (
      this.verificationStatus === VerificationStatus.VERIFIED ||
      this.verificationStatus === VerificationStatus.PREMIUM
    );
  }

  public updateContact(phone: string, email: string, website: string): void {
    this.phone = phone;
    this.email = email;
    this.website = website;
  }
}
