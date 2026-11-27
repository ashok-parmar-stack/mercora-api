import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../modules/auth/decorators/public.decorator';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import { Roles, RequirePermissions, ADMIN_ROLES, STAFF_ROLES } from '../../../common';
import { SubscriptionPlansService } from '../services/subscription-plans.service';
import {
  CreateSubscriptionPlanDto,
  GenerateSystemPlansDto,
  UpdateSubscriptionPlanDto,
} from '../dto/subscription-plan.dto';

@ApiTags('Subscription Plans')
@Controller('v1')
export class SubscriptionPlansController {
  constructor(private readonly plansService: SubscriptionPlansService) {}

  @Public()
  @Get('subscription-plans')
  @ApiOperation({ summary: 'List active public subscription plans' })
  async listActivePlans() {
    const data = await this.plansService.findActivePlans();
    return { success: true, data };
  }

  @Public()
  @Get('subscription-plans/:id')
  @ApiOperation({ summary: 'Get subscription plan details by ID (supports inactive lookup)' })
  async getPlanById(@Param('id', new ParseUUIDPipe()) id: string) {
    const data = await this.plansService.findById(id);
    return { success: true, data };
  }

  @Get('admin/subscription-plans')
  @ApiBearerAuth()
  @Roles(...STAFF_ROLES)
  @RequirePermissions('SUBSCRIPTION_PLANS.VIEW')
  @ApiOperation({ summary: 'Admin: list all subscription plans with subscriber counts' })
  async listAdminPlans() {
    const data = await this.plansService.findAllAdmin();
    return { success: true, data };
  }

  @Get('admin/subscription-plans/system-templates')
  @ApiBearerAuth()
  @Roles(...STAFF_ROLES)
  @RequirePermissions('SUBSCRIPTION_PLANS.VIEW')
  @ApiOperation({ summary: 'Admin: get Mercora system-preset subscription templates' })
  async getSystemPlanTemplates() {
    const data = this.plansService.getSystemPlanTemplates();
    return { success: true, data };
  }

  @Post('admin/subscription-plans/generate-system-plans')
  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @RequirePermissions('SUBSCRIPTION_PLANS.CREATE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: generate or sync Mercora system subscription plans safely' })
  async generateSystemPlans(
    @Body() dto: GenerateSystemPlansDto,
    @CurrentUser() user: { id: string },
  ) {
    const result = await this.plansService.generateSystemPlans(dto, user?.id);
    return {
      success: true,
      message: `Generated ${result.createdCount} plan(s) and synced ${result.updatedCount} existing system plan(s).`,
      data: result,
    };
  }

  @Get('admin/subscription-plans/:id/subscribers')
  @ApiBearerAuth()
  @Roles(...STAFF_ROLES)
  @RequirePermissions('SUBSCRIPTION_PLANS.VIEW')
  @ApiOperation({ summary: 'Admin: view businesses subscribed to a specific plan' })
  async getPlanSubscribers(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.plansService.getPlanSubscribers(id, page, limit);
    return { success: true, ...result };
  }

  @Post('admin/subscription-plans')
  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @RequirePermissions('SUBSCRIPTION_PLANS.CREATE')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Admin: create a new subscription plan' })
  async createPlan(
    @Body() dto: CreateSubscriptionPlanDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.plansService.createPlan(dto, user?.id);
    return { success: true, message: 'Subscription plan created successfully.', data };
  }

  @Patch('admin/subscription-plans/:id')
  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @RequirePermissions('SUBSCRIPTION_PLANS.UPDATE')
  @ApiOperation({ summary: 'Admin: update subscription plan (preserves existing subscriber snapshots)' })
  async updatePlan(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSubscriptionPlanDto,
    @CurrentUser() user: { id: string },
  ) {
    const data = await this.plansService.updatePlan(id, dto, user?.id);
    return { success: true, message: 'Subscription plan updated successfully.', data };
  }
}
