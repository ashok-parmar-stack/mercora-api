import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentGateway } from '../subscription.constants';
import { IPaymentGatewayAdapter } from './payment-gateway.interface';
import { RazorpayGatewayAdapter } from './razorpay-gateway.adapter';

@Injectable()
export class PaymentGatewayRegistry {
  private readonly adapters = new Map<string, IPaymentGatewayAdapter>();

  constructor(private readonly razorpayAdapter: RazorpayGatewayAdapter) {
    this.register(this.razorpayAdapter);
  }

  register(adapter: IPaymentGatewayAdapter): void {
    this.adapters.set(String(adapter.gatewayCode).toUpperCase(), adapter);
  }

  getAdapter(gateway: string = PaymentGateway.RAZORPAY): IPaymentGatewayAdapter {
    const key = String(gateway || PaymentGateway.RAZORPAY).trim().toUpperCase();
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new BadRequestException(`Unsupported payment gateway "${gateway}".`);
    }
    return adapter;
  }

  listPublicConfigs() {
    return Array.from(this.adapters.values()).map((a) => a.getPublicConfig());
  }
}
