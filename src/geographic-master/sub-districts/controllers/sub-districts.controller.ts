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
import { SubDistrictsService } from '../services/sub-districts.service';
import {
  CreateSubDistrictDto,
  UpdateSubDistrictDto,
  SubDistrictQueryDto,
  UpdateSubDistrictStatusDto,
} from '../dto';

@ApiTags('Geographic Master - SubDistricts')
@Controller('v1/admin/sub-districts')
export class SubDistrictsController {
  constructor(private readonly subDistrictsService: SubDistrictsService) {}

  @Get()
  @ApiOperation({ summary: 'List sub-districts with pagination and filtering' })
  @ApiResponse({ status: 200, description: 'Paginated sub-districts retrieved' })
  async findAll(@Query() query: SubDistrictQueryDto) {
    const result = await this.subDistrictsService.findAll(query);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'SubDistricts fetched successfully.',
      data: result,
    };
  }

  @Get(':idOrCode')
  @ApiOperation({ summary: 'Get subDistrict by UUID or Code' })
  @ApiParam({ name: 'idOrCode', description: 'SubDistrict UUID or Code' })
  @ApiResponse({ status: 200, description: 'SubDistrict details' })
  @ApiResponse({ status: 404, description: 'SubDistrict not found' })
  async findOne(@Param('idOrCode') idOrCode: string) {
    const subDistrict = await this.subDistrictsService.findOne(idOrCode);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'SubDistrict fetched successfully.',
      data: subDistrict,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new subDistrict record' })
  @ApiResponse({ status: 201, description: 'SubDistrict created successfully' })
  @ApiResponse({ status: 409, description: 'SubDistrict code already exists in district' })
  async create(@Body() dto: CreateSubDistrictDto) {
    const subDistrict = await this.subDistrictsService.create(dto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'SubDistrict created successfully.',
      data: subDistrict,
    };
  }

  @Patch(':idOrCode')
  @ApiOperation({ summary: 'Update subDistrict details' })
  @ApiParam({ name: 'idOrCode', description: 'SubDistrict UUID or Code' })
  @ApiResponse({ status: 200, description: 'SubDistrict updated successfully' })
  @ApiResponse({ status: 404, description: 'SubDistrict not found' })
  async update(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: UpdateSubDistrictDto,
  ) {
    const subDistrict = await this.subDistrictsService.update(idOrCode, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'SubDistrict updated successfully.',
      data: subDistrict,
    };
  }

  @Patch(':idOrCode/status')
  @ApiOperation({ summary: 'Update subDistrict active status' })
  @ApiParam({ name: 'idOrCode', description: 'SubDistrict UUID or Code' })
  @ApiResponse({ status: 200, description: 'SubDistrict status updated' })
  async updateStatus(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: UpdateSubDistrictStatusDto,
  ) {
    const subDistrict = await this.subDistrictsService.updateStatus(idOrCode, dto.status);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: `SubDistrict status updated successfully.`,
      data: subDistrict,
    };
  }

  @Delete(':idOrCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a subDistrict record' })
  @ApiParam({ name: 'idOrCode', description: 'SubDistrict UUID or Code' })
  async remove(@Param('idOrCode') idOrCode: string) {
    await this.subDistrictsService.softDelete(idOrCode);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'SubDistrict deleted successfully.',
    };
  }
}
