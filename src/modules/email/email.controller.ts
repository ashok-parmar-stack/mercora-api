import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EmailTemplateService } from './services/email-template.service';
import { Roles, ADMIN_ROLES } from '../../common';

@ApiTags('Email Templates')
@Roles(...ADMIN_ROLES)
@Controller('v1/admin/email-templates')
export class EmailController {
  constructor(private readonly templateService: EmailTemplateService) {}

  @Get()
  @ApiOperation({ summary: 'List all dynamic email notification templates' })
  @ApiResponse({ status: 200, description: 'Templates fetched successfully' })
  async getTemplates() {
    const list = await this.templateService.getAllTemplates();
    return {
      success: true,
      data: list.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        subject: t.subject,
        category: (t.code.includes('INVITATION')
          ? 'AUTH'
          : t.code.includes('RESET')
          ? 'SECURITY'
          : t.code.includes('VERIFY')
          ? 'AUTH'
          : 'NOTIFICATION') as 'AUTH' | 'NOTIFICATION' | 'BILLING' | 'SECURITY',
        status: ((t.status?.code === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') as 'ACTIVE' | 'INACTIVE'),
        updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      })),
      total: list.length,
    };
  }
}
