import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import { InvoiceService } from '../services/invoice.service';
import { SubscriptionEntitlementService } from '../services/subscription-entitlement.service';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('v1/invoices')
export class InvoicesController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly entitlementService: SubscriptionEntitlementService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List invoices for the authenticated business owner' })
  async listInvoices(
    @CurrentUser() user: { id: string; email?: string },
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const owned = await this.entitlementService.findOwnedBusinesses(user.id, user.email);
    const result = await this.invoiceService.listForUser(
      user.id,
      owned.map((b) => b.id),
      page,
      limit,
    );
    return { success: true, ...result };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice details by ID' })
  async getInvoice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { id: string; email?: string; role?: string },
  ) {
    const owned = await this.entitlementService.findOwnedBusinesses(user.id, user.email);
    const inv = await this.invoiceService.getAuthorizedInvoice(
      id,
      user,
      owned.map((b) => b.id),
    );
    return { success: true, data: this.invoiceService.toInvoiceView(inv) };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download GST Tax Invoice PDF' })
  async downloadInvoice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: { id: string; email?: string; role?: string },
    @Res() res: Response,
  ) {
    const owned = await this.entitlementService.findOwnedBusinesses(user.id, user.email);
    const inv = await this.invoiceService.getAuthorizedInvoice(
      id,
      user,
      owned.map((b) => b.id),
    );
    const pdfBuffer = await this.invoiceService.renderPdfBuffer(inv);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${inv.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf"`,
    );
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.send(pdfBuffer);
  }
}
