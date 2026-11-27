import { InvoiceService } from '../../../src/modules/subscriptions/services/invoice.service';

describe('InvoiceService (Unit - GST & PDF Generation)', () => {
  it('computes CGST + SGST for intra-state supply and IGST for inter-state supply', () => {
    const service = new InvoiceService({} as any);

    const intra = service.computeGstBreakdown(100000, 1800, 'Gujarat', 'Gujarat');
    expect(intra.isIntraState).toBe(true);
    expect(intra.taxMinor).toBe(18000);
    expect(intra.cgstMinor).toBe(9000);
    expect(intra.sgstMinor).toBe(9000);
    expect(intra.igstMinor).toBe(0);
    expect(intra.totalMinor).toBe(118000);

    const inter = service.computeGstBreakdown(100000, 1800, 'Maharashtra', 'Gujarat');
    expect(inter.isIntraState).toBe(false);
    expect(inter.taxMinor).toBe(18000);
    expect(inter.cgstMinor).toBe(0);
    expect(inter.sgstMinor).toBe(0);
    expect(inter.igstMinor).toBe(18000);
    expect(inter.totalMinor).toBe(118000);
  });

  it('renders a valid non-empty GST tax invoice PDF buffer', async () => {
    const service = new InvoiceService({} as any);
    const buffer = await service.renderPdfBuffer({
      id: 'inv-unit-1',
      invoiceNumber: 'MERC-2026-0099',
      paymentId: 'pay-unit-1',
      subtotalMinor: 99900,
      taxMinor: 17982,
      cgstMinor: 8991,
      sgstMinor: 8991,
      igstMinor: 0,
      totalMinor: 117882,
      currency: 'INR',
      status: 'PAID',
      invoiceDate: new Date('2026-06-01T00:00:00.000Z'),
      sellerDetails: {
        legalName: 'Mercora Pvt Ltd',
        gstin: '24AAACM0000A1Z5',
        state: 'Gujarat',
        address: 'Ahmedabad, India',
        sacCode: '998314',
      },
      billingDetails: {
        businessName: 'Bharat Pumps Ltd',
        state: 'Gujarat',
        city: 'Rajkot',
        email: 'billing@bharatpumps.in',
      },
      lineItems: [
        {
          description: 'Starter Monthly Subscription',
          sacCode: '998314',
          quantity: 1,
          unitPriceMinor: 99900,
          taxMinor: 17982,
          totalMinor: 117882,
        },
      ],
    } as any);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.slice(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
