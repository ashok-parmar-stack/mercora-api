import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentGateway, SubscriptionStatus } from '../subscription.constants';

export class BillingDetailsDto {
  @ApiPropertyOptional({ description: 'Company / Legal Billing Name for GST Tax Invoice', example: 'Apex Steel Pvt Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  billingName?: string;

  @ApiPropertyOptional({ description: 'Optional 15-character Indian GSTIN for tax credit invoice', example: '24AAACM0000A1Z5' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Matches(/^$|^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}[1-9A-Za-z]{1}[Zz][0-9A-Za-z]{1}$/, {
    message: 'Please enter a valid 15-character GSTIN (e.g. 24AAACM0000A1Z5) or leave blank.',
  })
  gstin?: string;

  @ApiPropertyOptional({ description: 'Billing state for CGST/SGST vs IGST calculation', example: 'Gujarat' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ description: 'Billing address line (optional)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class CheckoutSubscriptionDto {
  @ApiProperty({ description: 'Selected subscription plan UUID' })
  @IsUUID()
  @IsNotEmpty()
  planId: string;

  @ApiPropertyOptional({ description: 'Target owned directory business ID (optional for account-level billing)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  businessId?: string;

  @ApiPropertyOptional({ type: BillingDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingDetailsDto)
  billingDetails?: BillingDetailsDto;

  @ApiPropertyOptional({ enum: PaymentGateway, default: PaymentGateway.RAZORPAY })
  @IsOptional()
  @IsEnum(PaymentGateway)
  gateway?: PaymentGateway;

  @ApiPropertyOptional({ description: 'Client-generated idempotency key to prevent duplicate orders' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class RenewSubscriptionDto {
  @ApiPropertyOptional({ description: 'Plan UUID to renew onto (defaults to current or scheduled plan)' })
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  businessId?: string;

  @ApiPropertyOptional({ type: BillingDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingDetailsDto)
  billingDetails?: BillingDetailsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class UpgradeSubscriptionDto {
  @ApiProperty({ description: 'Target higher-tier plan UUID' })
  @IsUUID()
  @IsNotEmpty()
  targetPlanId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  businessId?: string;

  @ApiPropertyOptional({ type: BillingDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BillingDetailsDto)
  billingDetails?: BillingDetailsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class DowngradeSubscriptionDto {
  @ApiProperty({ description: 'Target lower-tier plan UUID' })
  @IsUUID()
  @IsNotEmpty()
  targetPlanId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  businessId?: string;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  businessId?: string;

  @ApiPropertyOptional({ default: true, description: 'Cancel at period end (default) or immediately' })
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminSubscriptionQueryDto {
  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter subscriptions expiring within N days' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiringWithinDays?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AdminUpdateSubscriptionDto {
  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ description: 'Extend expiry by N days' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  extendDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
