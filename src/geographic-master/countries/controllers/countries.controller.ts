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
  ApiQuery,
} from '@nestjs/swagger';
import { CountriesService } from '../services/countries.service';
import {
  CreateCountryDto,
  UpdateCountryDto,
  CountryQueryDto,
  UpdateCountryStatusDto,
} from '../dto';

@ApiTags('Geographic Master - Countries')
@Controller('v1/admin/countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Get()
  @ApiOperation({
    summary: 'List countries with pagination and filtering',
    description: 'Retrieves countries list supporting page, limit, search, status, sort_by, and sort_order.',
  })
  @ApiResponse({ status: 200, description: 'Paginated countries retrieved' })
  async findAll(@Query() query: CountryQueryDto) {
    const result = await this.countriesService.findAll(query);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Countries fetched successfully.',
      data: result,
    };
  }

  @Post('seed-baseline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify country master records',
  })
  @ApiResponse({ status: 200, description: 'Countries status retrieved' })
  async seedBaseline() {
    const result = await this.countriesService.seedBaseline();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }

  @Get(':idOrCode')
  @ApiOperation({
    summary: 'Get country by UUID, ISO2, or ISO3',
    description: 'Resolves country details using UUID, ISO2 (e.g. IN), ISO3 (e.g. IND), or exact name.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Country UUID, ISO2 (IN), or ISO3 (IND)', example: 'IN' })
  @ApiResponse({ status: 200, description: 'Country details' })
  @ApiResponse({ status: 404, description: 'Country not found' })
  async findOne(@Param('idOrCode') idOrCode: string) {
    const country = await this.countriesService.findOne(idOrCode);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Country fetched successfully.',
      data: country,
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new country record',
    description: 'Creates a country master record with ISO2/ISO3 uniqueness and validation.',
  })
  @ApiResponse({ status: 201, description: 'Country created successfully' })
  @ApiResponse({ status: 409, description: 'Country name or ISO code already exists' })
  async create(@Body() dto: CreateCountryDto) {
    const country = await this.countriesService.create(dto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'Country created successfully.',
      data: country,
    };
  }

  @Patch(':idOrCode')
  @ApiOperation({
    summary: 'Update country details',
    description: 'Updates specific attributes of a country record.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Country UUID, ISO2, or ISO3', example: 'IN' })
  @ApiResponse({ status: 200, description: 'Country updated successfully' })
  @ApiResponse({ status: 404, description: 'Country not found' })
  @ApiResponse({ status: 409, description: 'Unique conflict on updated code or name' })
  async update(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: UpdateCountryDto,
  ) {
    const country = await this.countriesService.update(idOrCode, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Country updated successfully.',
      data: country,
    };
  }

  @Patch(':idOrCode/status')
  @ApiOperation({
    summary: 'Update country active status',
    description: 'Updates status of country to ACTIVE, INACTIVE, or custom status UUID.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Country UUID, ISO2, or ISO3', example: 'IN' })
  @ApiResponse({ status: 200, description: 'Country status updated' })
  @ApiResponse({ status: 404, description: 'Country or Status not found' })
  async updateStatus(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: UpdateCountryStatusDto,
  ) {
    const country = await this.countriesService.updateStatus(idOrCode, dto.status);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: `Country status updated successfully.`,
      data: country,
    };
  }

  @Delete(':idOrCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete a country record',
    description: 'Soft-deletes country and sets status to INACTIVE to preserve historical references.',
  })
  @ApiParam({ name: 'idOrCode', description: 'Country UUID, ISO2, or ISO3', example: 'IN' })
  @ApiResponse({ status: 200, description: 'Country soft-deleted' })
  @ApiResponse({ status: 404, description: 'Country not found' })
  async remove(@Param('idOrCode') idOrCode: string) {
    const result = await this.countriesService.remove(idOrCode);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: null,
    };
  }
}
