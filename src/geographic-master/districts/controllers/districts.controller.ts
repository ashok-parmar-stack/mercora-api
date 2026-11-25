import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { DistrictsService } from '../services/districts.service';
import { Roles, CATALOG_ADMIN_ROLES } from '../../../common';
import {
  CreateDistrictDto,
  UpdateDistrictDto,
  DistrictQueryDto,
  UpdateDistrictStatusDto,
} from '../dto';

@ApiTags('Geographic Master - Districts')
@Roles(...CATALOG_ADMIN_ROLES)
@Controller('v1/admin/districts')
export class DistrictsController {
  constructor(private readonly districtsService: DistrictsService) {}

  @Get()
  @ApiOperation({ summary: 'List districts with pagination and filtering' })
  @ApiResponse({ status: 200, description: 'Paginated districts retrieved' })
  async findAll(@Query() query: DistrictQueryDto) {
    const result = await this.districtsService.findAll(query);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Districts fetched successfully.',
      data: result,
    };
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed baseline industrial & ceramic districts' })
  @ApiResponse({ status: 200, description: 'Districts seeded successfully' })
  async seedBaseline() {
    const result = await this.districtsService.seedBaseline();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }

  @Get(':idOrCode')
  @ApiOperation({ summary: 'Get district by UUID or Code' })
  @ApiParam({ name: 'idOrCode', description: 'District UUID or Code' })
  @ApiResponse({ status: 200, description: 'District details' })
  @ApiResponse({ status: 404, description: 'District not found' })
  async findOne(@Param('idOrCode') idOrCode: string) {
    const district = await this.districtsService.findOne(idOrCode);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'District fetched successfully.',
      data: district,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new district record' })
  @ApiResponse({ status: 201, description: 'District created successfully' })
  @ApiResponse({ status: 409, description: 'District code already exists in state' })
  async create(@Body() dto: CreateDistrictDto) {
    const district = await this.districtsService.create(dto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'District created successfully.',
      data: district,
    };
  }

  @Patch(':idOrCode')
  @ApiOperation({ summary: 'Update district details' })
  @ApiParam({ name: 'idOrCode', description: 'District UUID or Code' })
  @ApiResponse({ status: 200, description: 'District updated successfully' })
  @ApiResponse({ status: 404, description: 'District not found' })
  async update(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: UpdateDistrictDto,
  ) {
    const district = await this.districtsService.update(idOrCode, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'District updated successfully.',
      data: district,
    };
  }

  @Patch(':idOrCode/status')
  @ApiOperation({ summary: 'Update district active status' })
  @ApiParam({ name: 'idOrCode', description: 'District UUID or Code' })
  @ApiResponse({ status: 200, description: 'District status updated' })
  async updateStatus(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: UpdateDistrictStatusDto,
  ) {
    const district = await this.districtsService.updateStatus(idOrCode, dto.status);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: `District status updated successfully.`,
      data: district,
    };
  }

  @Delete(':idOrCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a district record' })
  @ApiParam({ name: 'idOrCode', description: 'District UUID or Code' })
  async remove(@Param('idOrCode') idOrCode: string) {
    await this.districtsService.softDelete(idOrCode);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'District deleted successfully.',
    };
  }
}
