import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import { ADMIN_ROLES, RequirePermissions, Roles, STAFF_ROLES } from '../../../common';
import { PaymentService } from '../services/payment.service';
import { RefundService } from '../services/refund.service';
import { SubscriptionLifecycleService } from '../services/subscription-lifecycle.service';
import { PaymentAnalyticsService } from '../services/payment-analytics.service';
import { InvoiceService } from '../services/invoice.service';
import { SubscriptionSchedulerService } from '../services/subscription-scheduler.service';
import {
  CreateRefundDto,
  PaymentQueryDto,
  UpdatePaymentSettingsDto,
} from '../dto/payment.dto';
import {
  AdminSubscriptionQueryDto,
  AdminUpdateSubscriptionDto,
} from '../dto/subscription.dto';

@ApiTags('Admin Payments & Subscriptions')
@ApiBearerAuth()
@Controller('v1/admin')
export class AdminPaymentsController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly refundService: RefundService,
    private readonly lifecycleService: SubscriptionLifecycleService,
    private readonly analyticsService: PaymentAnalyticsService,
    private readonly invoiceService: InvoiceService,
    private readonly schedulerService: SubscriptionSchedulerService,
  ) {}

  @Get('payment-analytics')
  @Roles(...STAFF_ROLES)
  @RequirePermissions('PAYMENTS.VIEW')
  @ApiOperation({ summary: 'Admin: real-time subscription & payment analytics KPIs and charts' })
  async getAnalytics(@Query('months') months?: number) {
    const data = await this.analyticsService.getAdminAnalytics(months);
    return { success: true, data };
  }

  @Get('payments')
  @Roles(...STAFF_ROLES)
  @RequirePermissions('PAYMENTS.VIEW')
  @ApiOperation({ summary: 'Admin: list and filter all subscription payment transactions' })
  async listPayments(@Query() query: PaymentQueryDto) {
    const result = await this.paymentService.listAdminPayments(query);
    return { success: true, ...result };
  }

  @Get('payments/export')
  @Roles(...STAFF_ROLES)
  @RequirePermissions('PAYMENTS.EXPORT')
  @ApiOperation({ summary: 'Admin: export filtered payment transactions to CSV' })
  async exportPayments(@Query() query: PaymentQueryDto, @Res() res: Response) {
    const csv = await this.paymentService.exportAdminPaymentsCsv(query);
    const filename = `mercora-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('payments/:id')
  @Roles(...STAFF_ROLES)
  @RequirePermissions('PAYMENTS.VIEW')
  @ApiOperation({ summary: 'Admin: get full payment transaction, gateway, subscription, invoice & refund details' })
  async getPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { id: string; email?: string; role?: string },
  ) {
    const data = await this.paymentService.getAuthorizedPaymentDetails(id, user);
    return { success: true, data };
  }

  @Post('payments/:id/refund')
  @Roles(...ADMIN_ROLES)
  @RequirePermissions('PAYMENTS.REFUND')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Admin (PAYMENTS.REFUND): initiate full or partial Razorpay refund' })
  async initiateRefund(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateRefundDto,
    @CurrentUser() user: { id: string },
    @Headers('x-idempotency-key') idempotencyHeader?: string,
  ) {
    const data = await this.refundService.initiateRefund(
      id,
      dto,
      user.id,
      idempotencyHeader,
    );
    return {
      success: true,
      message: data.duplicate
        ? 'Refund already initiated for this idempotency key.'
        : 'Refund initiated successfully.',
      data: data.refund,
    };
  }

  @Get('refunds')
  @Roles(...STAFF_ROLES)
  @RequirePermissions('PAYMENTS.VIEW')
  @ApiOperation({ summary: 'Admin: list refund history' })
  async listRefunds(@Query() query: PaymentQueryDto) {
    const result = await this.refundService.listRefunds(query);
    return { success: true, ...result };
  }

  @Get('invoices')
  @Roles(...STAFF_ROLES)
  @RequirePermissions('INVOICES.VIEW')
  @ApiOperation({ summary: 'Admin: list all generated subscription invoices' })
  async listInvoices(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('businessId') businessId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.invoiceService.listForAdmin({
      search,
      status,
      businessId,
      page,
      limit,
    });
    return { success: true, ...result };
  }

  @Get('subscriptions')
  @Roles(...STAFF_ROLES)
  @RequirePermissions('SUBSCRIPTIONS.VIEW')
  @ApiOperation({ summary: 'Admin: list all business subscriptions with filters' })
  async listSubscriptions(@Query() query: AdminSubscriptionQueryDto) {
    const result = await this.lifecycleService.listAdminSubscriptions(query);
    return { success: true, ...result };
  }

  @Get('subscriptions/:id')
  @Roles(...STAFF_ROLES)
  @RequirePermissions('SUBSCRIPTIONS.VIEW')
  @ApiOperation({ summary: 'Admin: view detailed subscription lifecycle, payments, changes & audit log' })
  async getSubscription(@Param('id', new ParseUUIDPipe()) id: string) {
    const data = await this.lifecycleService.getAdminSubscriptionById(id);
    return { success: true, data };
  }

  @Patch('subscriptions/:id')
  @Roles(...ADMIN_ROLES)
  @RequirePermissions('SUBSCRIPTIONS.MANAGE_STATUS')
  @ApiOperation({ summary: 'Admin (SUBSCRIPTIONS.MANAGE_STATUS): update subscription status or extend validity' })
  async updateSubscription(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdminUpdateSubscriptionDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.lifecycleService.adminUpdateSubscription(id, dto, user.id);
    return { success: true, message: 'Subscription updated successfully.', data };
  }

  @Post('subscriptions/run-maintenance')
  @Roles(...ADMIN_ROLES)
  @RequirePermissions('SUBSCRIPTIONS.MANAGE_STATUS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: run expiry sweep, pending Razorpay reconciliation & webhook retries' })
  async runMaintenance() {
    const data = await this.schedulerService.runMaintenanceTick();
    return { success: true, data };
  }

  @Get('payment-settings')
  @Roles(...STAFF_ROLES)
  @RequirePermissions('PAYMENTS.VIEW')
  @ApiOperation({ summary: 'Admin: retrieve operational payment & tax invoice settings (no secrets)' })
  async getSettings() {
    const data = await this.lifecycleService.getAdminPaymentSettingsView();
    return { success: true, data };
  }

  @Patch('payment-settings')
  @Roles(...ADMIN_ROLES)
  @RequirePermissions('SUBSCRIPTION_PLANS.UPDATE')
  @ApiOperation({ summary: 'Admin: update GST, grace period, scheduler, upgrade/downgrade & invoice settings in DB' })
  async updateSettings(
    @Body() dto: UpdatePaymentSettingsDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.lifecycleService.updatePaymentSettings(dto, user.id);
    await this.schedulerService?.reloadSchedule?.();
    return { success: true, message: 'Payment settings updated successfully.', data };
  }
}
