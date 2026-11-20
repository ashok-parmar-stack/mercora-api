import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';

@ApiTags('Audit Logs')
@Controller('v1/admin/audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List recent immutable system audit trails' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max items to return' })
  @ApiResponse({ status: 200, description: 'Audit trail records' })
  async getAuditLogs(@Query('limit') limit?: number) {
    const list = await this.auditService.findAll(limit ? Number(limit) : 50);
    return {
      success: true,
      data: list.map((l) => ({
        id: l.id,
        action: l.action,
        module: l.module,
        actorEmail: l.user?.email || 'system@mercora.com',
        ipAddress: l.ipAddress || '127.0.0.1',
        timestamp: l.createdAt ? new Date(l.createdAt).toLocaleString('en-IN') : 'Just now',
        severity: l.action.includes('DELETE') || l.action.includes('DROP')
          ? 'CRITICAL'
          : l.action.includes('UPDATE') || l.action.includes('REVOKE')
          ? 'WARNING'
          : 'INFO',
        details: l.entityType ? `${l.action} on ${l.entityType} (${l.entityId || 'N/A'})` : l.action,
      })),
      total: list.length,
    };
  }
}
