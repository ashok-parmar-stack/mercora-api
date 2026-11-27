import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../modules/auth/decorators/public.decorator';
import { WebhookService } from '../services/webhook.service';

@ApiTags('Payment Webhooks')
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhookService: WebhookService) {}

  @Public()
  @Post('razorpay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Razorpay Webhook Listener (HMAC-SHA256 raw body verification & idempotent processing)',
  })
  async handleRazorpayWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    const rawBody =
      req.rawBody ||
      (Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === 'string'
          ? req.body
          : undefined);

    const parsedBody =
      req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? (req.body as Record<string, unknown>)
        : undefined;

    return this.webhookService.handleRazorpayWebhook({
      rawBody,
      signature,
      headers: req.headers,
      parsedBody,
    });
  }
}
