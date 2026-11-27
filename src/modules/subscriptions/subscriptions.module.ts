import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../common/shared.module';
import { EmailModule } from '../email/email.module';
import { BusinessOrmEntity } from '../businesses/infrastructure/persistence/entities/business-orm.entity';
import { BusinessEnquiryEntity } from '../../database/entities/business-enquiry.entity';
import { UserEntity } from '../../database/entities/user.entity';
import {
  InvoiceEntity,
  PaymentAttemptEntity,
  PaymentEntity,
  PaymentSettingsEntity,
  PaymentWebhookEventEntity,
  PlanFeatureEntity,
  RefundEntity,
  SubscriptionAuditLogEntity,
  SubscriptionChangeEntity,
  SubscriptionEntity,
  SubscriptionPlanEntity,
} from './entities';
import { RazorpayGatewayAdapter } from './gateways/razorpay-gateway.adapter';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { SubscriptionPlansService } from './services/subscription-plans.service';
import { SubscriptionEntitlementService } from './services/subscription-entitlement.service';
import { InvoiceService } from './services/invoice.service';
import { SubscriptionLifecycleService } from './services/subscription-lifecycle.service';
import { PaymentService } from './services/payment.service';
import { RefundService } from './services/refund.service';
import { WebhookService } from './services/webhook.service';
import { PaymentAnalyticsService } from './services/payment-analytics.service';
import { SubscriptionSchedulerService } from './services/subscription-scheduler.service';
import { SubscriptionPlansController } from './controllers/subscription-plans.controller';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { PaymentsController } from './controllers/payments.controller';
import { InvoicesController } from './controllers/invoices.controller';
import { WebhooksController } from './controllers/webhooks.controller';
import { AdminPaymentsController } from './controllers/admin-payments.controller';

@Module({
  imports: [
    ConfigModule,
    SharedModule,
    EmailModule,
    TypeOrmModule.forFeature([
      SubscriptionPlanEntity,
      PlanFeatureEntity,
      SubscriptionEntity,
      PaymentEntity,
      PaymentAttemptEntity,
      PaymentWebhookEventEntity,
      InvoiceEntity,
      RefundEntity,
      SubscriptionChangeEntity,
      SubscriptionAuditLogEntity,
      PaymentSettingsEntity,
      BusinessOrmEntity,
      BusinessEnquiryEntity,
      UserEntity,
    ]),
  ],
  controllers: [
    SubscriptionPlansController,
    SubscriptionsController,
    PaymentsController,
    InvoicesController,
    WebhooksController,
    AdminPaymentsController,
  ],
  providers: [
    RazorpayGatewayAdapter,
    PaymentGatewayRegistry,
    SubscriptionPlansService,
    SubscriptionEntitlementService,
    InvoiceService,
    SubscriptionLifecycleService,
    PaymentService,
    RefundService,
    WebhookService,
    PaymentAnalyticsService,
    SubscriptionSchedulerService,
  ],
  exports: [
    SubscriptionEntitlementService,
    SubscriptionPlansService,
    SubscriptionLifecycleService,
    PaymentService,
    InvoiceService,
    RefundService,
    WebhookService,
    PaymentAnalyticsService,
  ],
})
export class SubscriptionsModule {}
