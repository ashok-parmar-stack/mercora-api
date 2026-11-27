import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Inject,
  ForbiddenException,
  NotFoundException,
  Req,
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateBusinessUseCase } from '../../application/use-cases/create-business/create-business.use-case';
import { UpdateBusinessUseCase } from '../../application/use-cases/update-business/update-business.use-case';
import { CreateBusinessDto } from '../../application/use-cases/create-business/create-business.dto';
import { UpdateBusinessDto } from '../../application/use-cases/update-business/update-business.dto';
import { BusinessResponseDto } from '../../application/dto/business-response.dto';
import { API_HEADERS } from '../../../../config/headers.config';
import { API_MESSAGES } from '../../../../common/messages';
import { Roles, BUSINESS_WRITE_ROLES, CATALOG_ADMIN_ROLES } from '../../../../common';
import {
  IBusinessRepository,
  BUSINESS_REPOSITORY_TOKEN,
} from '../../domain/repositories/business.repository.interface';
import { BusinessEnquiryEntity } from '../../../../database/entities/business-enquiry.entity';
import { SubscriptionEntitlementService } from '../../../subscriptions/services/subscription-entitlement.service';

@ApiTags(API_HEADERS.modules.businesses.tag)
@Roles(...BUSINESS_WRITE_ROLES)
@Controller('customer/businesses')
export class CustomerBusinessController {
  constructor(
    private readonly createBusinessUseCase: CreateBusinessUseCase,
    private readonly updateBusinessUseCase: UpdateBusinessUseCase,
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository,
    @Optional()
    private readonly entitlementService?: SubscriptionEntitlementService,
    @Optional()
    @InjectRepository(BusinessEnquiryEntity)
    private readonly enquiryRepo?: Repository<BusinessEnquiryEntity>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List business profiles owned by current user with active subscription entitlements' })
  async listOwned(
    @Req() req: { user?: { id?: string; userId?: string; email?: string; role?: string } },
  ) {
    const userId = req?.user?.id || req?.user?.userId;
    if (!userId || !this.entitlementService) {
      return { success: true, data: [] };
    }
    const owned = await this.entitlementService.findOwnedBusinesses(userId, req?.user?.email);
    const results = await Promise.all(
      owned.map(async (b) => {
        const entitlement = await this.entitlementService!.getBusinessEntitlements(b.id);
        return {
          id: b.id,
          name: b.name,
          slug: b.slug,
          city: b.city,
          state: b.state,
          category: b.category,
          businessType: b.business_type,
          verificationStatus: b.verification_status,
          productsCount: Array.isArray(b.products) ? b.products.length : 0,
          contactsCount: Array.isArray(b.contacts) ? b.contacts.length : 0,
          entitlement,
        };
      }),
    );
    return { success: true, data: results };
  }

  @Post()
  @ApiOperation({ summary: 'Register new business vendor profile' })
  async create(
    @Body() dto: CreateBusinessDto,
    @Req() req: { user?: { id?: string; userId?: string; email?: string; role?: string } },
  ) {
    const userId = req?.user?.id || req?.user?.userId;
    const isAdmin = Boolean(
      req?.user?.role &&
        (CATALOG_ADMIN_ROLES as readonly string[]).includes(req.user.role.toUpperCase()),
    );
    return this.createBusinessUseCase.execute(dto, userId, {
      bypassSubscriptionLimits: isAdmin,
      ownerEmail: req?.user?.email,
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update own business profile and contact information' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBusinessDto,
    @Req() req: { user?: { id?: string; userId?: string; email?: string; role?: string } },
  ) {
    const user = req?.user;
    const callerUserId = user?.id || user?.userId;
    const isAdmin = Boolean(
      user?.role && (CATALOG_ADMIN_ROLES as readonly string[]).includes(user.role.toUpperCase()),
    );
    if (!isAdmin) {
      const existing = await this.businessRepository.findById(id);
      if (!existing) {
        throw new NotFoundException(API_MESSAGES.businesses.notFound);
      }
      const ownsByUserId = Boolean(
        existing.ownerUserId && callerUserId && existing.ownerUserId === callerUserId,
      );
      const ownsByLegacyEmail = Boolean(
        !existing.ownerUserId &&
          user?.email &&
          existing.email?.toLowerCase() === user.email.toLowerCase(),
      );
      if (!ownsByUserId && !ownsByLegacyEmail) {
        throw new ForbiddenException('You do not have permission to update this business.');
      }
      delete dto.verificationStatus;
    }
    return isAdmin
      ? this.updateBusinessUseCase.execute(id, dto, { bypassSubscriptionLimits: true })
      : this.updateBusinessUseCase.execute(id, dto);
  }

  @Get(':id/enquiries')
  @ApiOperation({ summary: 'List buyer RFQ enquiries for owned business (enforces plan enquiry quota)' })
  async listBusinessEnquiries(
    @Param('id') id: string,
    @Req() req: { user?: { id?: string; userId?: string; email?: string; role?: string } },
  ) {
    const userId = req?.user?.id || req?.user?.userId;
    if (!userId || !this.enquiryRepo) {
      return { success: true, data: [], total: 0 };
    }

    const existing = await this.businessRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(API_MESSAGES.businesses.notFound);
    }

    const isAdmin = Boolean(
      req?.user?.role &&
        (CATALOG_ADMIN_ROLES as readonly string[]).includes(req.user.role.toUpperCase()),
    );
    const ownsByUserId = Boolean(existing.ownerUserId && existing.ownerUserId === userId);
    const ownsByLegacyEmail = Boolean(
      !existing.ownerUserId &&
        req?.user?.email &&
        existing.email?.toLowerCase() === req.user.email.toLowerCase(),
    );
    if (!isAdmin && !ownsByUserId && !ownsByLegacyEmail) {
      throw new ForbiddenException('You do not have permission to view enquiries for this business.');
    }

    const enquiries = await this.enquiryRepo.find({
      where: { businessId: id },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    if (!this.entitlementService || isAdmin) {
      return { success: true, total: enquiries.length, data: enquiries };
    }

    const quota = await this.entitlementService.isWithinMonthlyEnquiryQuota(id);
    const visibleLimit = quota.limit < 0 ? enquiries.length : quota.limit;

    return {
      success: true,
      total: enquiries.length,
      quota,
      data: enquiries.map((e, idx) => {
        const unlocked = quota.leadInboxAccess && (quota.limit < 0 || idx < visibleLimit);
        if (unlocked) {
          return { ...e, lockedByPlanQuota: false };
        }
        return {
          id: e.id,
          businessId: e.businessId,
          businessName: e.businessName,
          senderName: e.senderName,
          senderEmail: null,
          senderPhone: '********** (Upgrade plan to unlock)',
          companyName: e.companyName,
          message: e.message.slice(0, 80) + '...',
          status: e.status,
          source: e.source,
          createdAt: e.createdAt,
          lockedByPlanQuota: true,
        };
      }),
    };
  }
}
