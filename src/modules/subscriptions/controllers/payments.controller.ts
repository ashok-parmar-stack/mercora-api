import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import { PaymentService } from '../services/payment.service';
import {
  CreatePaymentOrderDto,
  PaymentQueryDto,
  VerifyRazorpayPaymentDto,
} from '../dto/payment.dto';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('v1/payments')
export class PaymentsController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create-order')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or retrieve Razorpay payment order for pending subscription checkout' })
  async createOrder(
    @CurrentUser() user: { id: string; email: string; name?: string; role?: string },
    @Body() dto: CreatePaymentOrderDto,
    @Headers('x-idempotency-key') idempotencyHeader?: string,
  ) {
    const data = await this.paymentService.createOrder(user, dto, idempotencyHeader);
    return { success: true, data };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Razorpay Checkout payment signature, capture status, and activate subscription' })
  async verifyPayment(
    @CurrentUser() user: { id: string; email?: string; role?: string },
    @Body() dto: VerifyRazorpayPaymentDto,
  ) {
    const data = await this.paymentService.verifyCheckoutPayment(user, dto);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'List paginated payment history for authenticated business user' })
  async listPayments(
    @CurrentUser() user: { id: string; email?: string },
    @Query() query: PaymentQueryDto,
  ) {
    const result = await this.paymentService.listBusinessPayments(user, query);
    return { success: true, ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sanitized payment details by ID' })
  async getPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { id: string; email?: string; role?: string },
  ) {
    const data = await this.paymentService.getAuthorizedPaymentDetails(id, user);
    return { success: true, data };
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get backend-confirmed payment and subscription status for result screen' })
  async getPaymentStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { id: string; email?: string; role?: string },
  ) {
    const data = await this.paymentService.getPaymentStatus(id, user);
    return { success: true, data };
  }
}
