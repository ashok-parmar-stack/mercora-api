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
import { StatesService } from '../services/states.service';
import { Roles, CATALOG_ADMIN_ROLES } from '../../../common';
import {
  CreateStateDto,
  UpdateStateDto,
  StateQueryDto,
  UpdateStateStatusDto,
} from '../dto';

@ApiTags('Geographic Master - States')
@Roles(...CATALOG_ADMIN_ROLES)
@Controller('v1/admin/states')
export class StatesController {
  constructor(private readonly statesService: StatesService) {}

  @Get()
  @ApiOperation({ summary: 'List states with pagination and filtering' })
  @ApiResponse({ status: 200, description: 'Paginated states retrieved' })
  async findAll(@Query() query: StateQueryDto) {
    const result = await this.statesService.findAll(query);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'States fetched successfully.',
      data: result,
    };
  }

  @Post('seed-baseline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify state master records' })
  @ApiResponse({ status: 200, description: 'States status retrieved' })
  async seedBaseline() {
    const result = await this.statesService.seedBaseline();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }

  @Get(':idOrCode')
  @ApiOperation({ summary: 'Get state by UUID or Code' })
  @ApiParam({ name: 'idOrCode', description: 'State UUID or Code' })
  @ApiResponse({ status: 200, description: 'State details' })
  @ApiResponse({ status: 404, description: 'State not found' })
  async findOne(@Param('idOrCode') idOrCode: string) {
    const state = await this.statesService.findOne(idOrCode);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'State fetched successfully.',
      data: state,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new state record' })
  @ApiResponse({ status: 201, description: 'State created successfully' })
  @ApiResponse({ status: 409, description: 'State code already exists in country' })
  async create(@Body() dto: CreateStateDto) {
    const state = await this.statesService.create(dto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'State created successfully.',
      data: state,
    };
  }

  @Patch(':idOrCode')
  @ApiOperation({ summary: 'Update state details' })
  @ApiParam({ name: 'idOrCode', description: 'State UUID or Code' })
  @ApiResponse({ status: 200, description: 'State updated successfully' })
  @ApiResponse({ status: 404, description: 'State not found' })
  async update(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: UpdateStateDto,
  ) {
    const state = await this.statesService.update(idOrCode, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'State updated successfully.',
      data: state,
    };
  }

  @Patch(':idOrCode/status')
  @ApiOperation({ summary: 'Update state active status' })
  @ApiParam({ name: 'idOrCode', description: 'State UUID or Code' })
  @ApiResponse({ status: 200, description: 'State status updated' })
  async updateStatus(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: UpdateStateStatusDto,
  ) {
    const state = await this.statesService.updateStatus(idOrCode, dto.status);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: `State status updated successfully.`,
      data: state,
    };
  }

  @Delete(':idOrCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a state record' })
  @ApiParam({ name: 'idOrCode', description: 'State UUID or Code' })
  async remove(@Param('idOrCode') idOrCode: string) {
    await this.statesService.softDelete(idOrCode);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'State deleted successfully.',
    };
  }
}
