import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BillingInterval, PlanFeatureGroup, PlanLimits } from '../subscription.constants';

export class PlanFeatureGroupDto implements PlanFeatureGroup {
  @ApiProperty({ example: 'directory_storefront' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  key: string;

  @ApiProperty({ example: 'Directory Listing & Storefront' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  included: boolean;

  @ApiProperty({ type: [String], example: ['Up to 5 Verified Business Listings'] })
  @IsArray()
  @IsString({ each: true })
  items: string[];
}

export class PlanLimitsDto implements PlanLimits {
  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(-1)
  maxBusinessListings: number;

  @ApiProperty({ example: 75 })
  @IsInt()
  @Min(-1)
  maxProducts: number;

  @ApiProperty({ example: 300 })
  @IsInt()
  @Min(-1)
  maxEnquiriesPerMonth: number;

  @ApiProperty({ example: 8 })
  @IsInt()
  @Min(-1)
  maxContacts: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  featuredListing: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  verifiedPriority: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  leadInboxAccess: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  analyticsAccess: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  prioritySupport: boolean;
}

export class CreateSubscriptionPlanDto {
  @ApiProperty({ example: 'PRO_QUARTERLY' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Professional Trade' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Accelerated lead capture and featured listings.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Most Popular' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @ApiPropertyOptional({ description: 'Compare-at / MRP price in INR rupees (optional struck-through price)', example: 3499 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @ApiPropertyOptional({ description: 'Compare-at / MRP price in integer paise', example: 349900 })
  @IsOptional()
  @IsInt()
  @Min(0)
  originalPriceMinor?: number;

  @ApiPropertyOptional({ description: 'Price in INR rupees (converted to paise if priceMinor omitted)', example: 2499 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Authoritative price in integer minor units (paise)', example: 249900 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinor?: number;

  @ApiPropertyOptional({ example: 'INR', default: 'INR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ enum: BillingInterval, example: BillingInterval.QUARTERLY })
  @IsEnum(BillingInterval)
  billingInterval: BillingInterval;

  @ApiProperty({ example: 90 })
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays: number;

  @ApiPropertyOptional({ example: 1800, description: 'GST rate in basis points (1800 = 18%)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  gstRateBps?: number;

  @ApiPropertyOptional({ type: [String], example: ['Up to 5 business listings', 'Featured placement'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ type: [PlanFeatureGroupDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureGroupDto)
  featureGroups?: PlanFeatureGroupDto[];

  @ApiProperty({ type: PlanLimitsDto })
  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits: PlanLimitsDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateSubscriptionPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  originalPriceMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinor?: number;

  @ApiPropertyOptional({ enum: BillingInterval })
  @IsOptional()
  @IsEnum(BillingInterval)
  billingInterval?: BillingInterval;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  gstRateBps?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ type: [PlanFeatureGroupDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureGroupDto)
  featureGroups?: PlanFeatureGroupDto[];

  @ApiPropertyOptional({ type: PlanLimitsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits?: PlanLimitsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class GenerateSystemPlansDto {
  @ApiPropertyOptional({
    type: [String],
    example: ['STARTER_MONTHLY', 'PRO_QUARTERLY', 'GROWTH_SIX_MONTHS', 'ENTERPRISE_YEARLY'],
    description: 'Specific Mercora system plan codes to generate. Defaults to all system templates.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  codes?: string[];

  @ApiPropertyOptional({
    default: true,
    description: 'Regenerate interactive system featureGroups on existing matching system plans without modifying price or subscriber snapshots.',
  })
  @IsOptional()
  @IsBoolean()
  syncFeatureGroups?: boolean;
}
