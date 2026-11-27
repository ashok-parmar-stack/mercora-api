import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BillingDetailsDto } from './subscription.dto';

export class CreatePaymentOrderDto {
  @ApiPropertyOptional({ description: 'Pending subscription ID to create/reopen order for' })
  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @ApiPropertyOptional({ description: 'Plan ID if starting a new checkout order' })
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

export class VerifyRazorpayPaymentDto {
  @ApiProperty({ example: 'order_H1234567890xyz' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  razorpayOrderId: string;

  @ApiProperty({ example: 'pay_I1234567890abc' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  razorpayPaymentId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  razorpaySignature: string;
}

export class PaymentQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gateway?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toDate?: string;

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

export class CreateRefundDto {
  @ApiPropertyOptional({ description: 'Refund amount in paise (omit for full remaining refundable amount)' })
  @IsOptional()
  @IsInt()
  @Min(100)
  amountMinor?: number;

  @ApiPropertyOptional({ description: 'Refund amount in INR rupees (used if amountMinor is omitted)' })
  @IsOptional()
  amount?: number;

  @ApiProperty({ example: 'Customer requested cancellation within 24 hours' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ default: 'normal', enum: ['normal', 'optimum'] })
  @IsOptional()
  @IsString()
  speed?: 'normal' | 'optimum';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class UpdatePaymentSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  razorpayEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  defaultGstRateBps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  gracePeriodDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  expiringReminderDays?: number;

  @ApiPropertyOptional({ enum: ['IMMEDIATE', 'END_OF_PERIOD'] })
  @IsOptional()
  @IsString()
  upgradePolicy?: 'IMMEDIATE' | 'END_OF_PERIOD';

  @ApiPropertyOptional({ enum: ['END_OF_PERIOD', 'IMMEDIATE'] })
  @IsOptional()
  @IsString()
  downgradePolicy?: 'END_OF_PERIOD' | 'IMMEDIATE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  refundRevokesAccess?: boolean;

  @ApiPropertyOptional({ description: 'Enable automated background subscription expiry & payment reconciliation job' })
  @IsOptional()
  @IsBoolean()
  schedulerEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Background scheduler interval in milliseconds (minimum 60000 ms)', example: 300000 })
  @IsOptional()
  @IsInt()
  @Min(60000)
  @Max(86400000)
  schedulerIntervalMs?: number;

  @ApiPropertyOptional({ description: 'Minutes before retrying/reconciling stuck CREATED payments via Razorpay', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  reconcilePendingMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(24)
  invoicePrefix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyLegalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  companyGstin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyState?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sacCode?: string;
}
