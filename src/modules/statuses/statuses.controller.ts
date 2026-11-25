import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { StatusesService } from './statuses.service';
import { Roles, STAFF_ROLES } from '../../common';

@ApiTags('Statuses')
@Roles(...STAFF_ROLES)
@Controller('statuses')
export class StatusesController {
  constructor(private readonly statusesService: StatusesService) {}

  /**
   * GET /statuses           — all statuses
   * GET /statuses?type=USER — filter by type (USER | ROLE | PERMISSION | COMPANY | EMAIL_TEMPLATE)
   */
  @Get()
  @ApiOperation({
    summary: 'List system statuses',
    description: 'Retrieves all statuses across entity types or filtered by entity type.',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter statuses by entity type (e.g. USER, ROLE, PERMISSION, COMPANY, EMAIL_TEMPLATE)',
    example: 'USER',
  })
  @ApiResponse({ status: 200, description: 'List of status entities' })
  findAll(@Query('type') type?: string) {
    return this.statusesService.findAll(type);
  }
}
