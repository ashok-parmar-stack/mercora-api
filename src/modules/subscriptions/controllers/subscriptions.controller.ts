import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import { SubscriptionLifecycleService } from '../services/subscription-lifecycle.service';
import { SubscriptionEntitlementService } from '../services/subscription-entitlement.service';
import {
  CancelSubscriptionDto,
  CheckoutSubscriptionDto,
  DowngradeSubscriptionDto,
  RenewSubscriptionDto,
  UpgradeSubscriptionDto,
} from '../dto/subscription.dto';

@ApiTags('Business Subscriptions')
@ApiBearerAuth()
@Controller('v1/subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly lifecycleService: SubscriptionLifecycleService,
    private readonly entitlementService: SubscriptionEntitlementService,
  ) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current active/latest subscription & entitlements for business' })
  async getCurrent(
    @CurrentUser() user: { id: string; email?: string; role?: string },
    @Query('businessId') businessId?: string,
  ) {
    const data = await this.lifecycleService.getCurrentSubscriptionOverview(user, businessId);
    return { success: true, data };
  }

  @Get('entitlements')
  @ApiOperation({ summary: 'Get computed feature limits and usage counters for owned business' })
  async getEntitlements(
    @CurrentUser() user: { id: string; email?: string; role?: string },
    @Query('businessId') businessId?: string,
  ) {
    const { business } = await this.entitlementService.resolveOwnedBusiness(
      user,
      businessId,
      false,
    );
    const data = await this.entitlementService.getBusinessEntitlements(business.id);
    return { success: true, data };
  }

  @Get('history')
  @ApiOperation({ summary: 'Get paginated subscription history for the authenticated business user' })
  async getHistory(
    @CurrentUser() user: { id: string; email?: string; role?: string },
    @Query('businessId') businessId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.lifecycleService.getSubscriptionHistory(
      user,
      businessId,
      page,
      limit,
    );
    return { success: true, ...result };
  }

  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate new subscription purchase & create Razorpay order' })
  async checkout(
    @CurrentUser() user: { id: string; email: string; name?: string; role?: string },
    @Body() dto: CheckoutSubscriptionDto,
    @Headers('x-idempotency-key') idempotencyHeader?: string,
  ) {
    const data = await this.lifecycleService.initiateCheckout(user, dto, idempotencyHeader);
    return { success: true, data };
  }

  @Post('renew')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate manual subscription renewal & create Razorpay order' })
  async renew(
    @CurrentUser() user: { id: string; email: string; name?: string; role?: string },
    @Body() dto: RenewSubscriptionDto,
    @Headers('x-idempotency-key') idempotencyHeader?: string,
  ) {
    const data = await this.lifecycleService.renewSubscription(user, dto, idempotencyHeader);
    return { success: true, data };
  }

  @Post('upgrade')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate subscription upgrade with backend proration & Razorpay order' })
  async upgrade(
    @CurrentUser() user: { id: string; email: string; name?: string; role?: string },
    @Body() dto: UpgradeSubscriptionDto,
    @Headers('x-idempotency-key') idempotencyHeader?: string,
  ) {
    const data = await this.lifecycleService.upgradeSubscription(user, dto, idempotencyHeader);
    return { success: true, data };
  }

  @Post('downgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Schedule subscription downgrade per configured billing policy' })
  async downgrade(
    @CurrentUser() user: { id: string; email: string; name?: string; role?: string },
    @Body() dto: DowngradeSubscriptionDto,
  ) {
    const data = await this.lifecycleService.scheduleDowngrade(user, dto);
    return { success: true, data };
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription (at period end or immediately)' })
  async cancel(
    @CurrentUser() user: { id: string; email: string; name?: string; role?: string },
    @Body() dto: CancelSubscriptionDto,
  ) {
    const data = await this.lifecycleService.cancelSubscription(user, dto);
    return { success: true, data };
  }
}
