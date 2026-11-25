import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { HsnCategoryMappingService } from '../services/hsn-category-mapping.service';
import { MapHsnCategoryDto } from '../dto';
import { Roles, CATALOG_ADMIN_ROLES } from '../../../common';

@ApiTags('Catalog Master - HSN Category Mappings')
@Roles(...CATALOG_ADMIN_ROLES)
@Controller('v1/admin')
export class HsnCategoryMappingController {
  constructor(private readonly mappingService: HsnCategoryMappingService) {}

  @Get('hsn-codes/:hsnId/categories')
  @ApiOperation({
    summary: 'Get all product categories mapped to an HSN code',
  })
  @ApiParam({ name: 'hsnId', description: 'HSN Code UUID' })
  @ApiResponse({ status: 200, description: 'Mapped categories retrieved' })
  async getCategoriesForHsn(@Param('hsnId') hsnId: string) {
    const result = await this.mappingService.getCategoriesForHsn(hsnId);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Mapped categories fetched successfully.',
      data: result,
    };
  }

  @Get('product-categories/:catId/hsn-codes')
  @ApiOperation({
    summary: 'Get all HSN codes mapped to a product category',
  })
  @ApiParam({ name: 'catId', description: 'Product Category UUID' })
  @ApiResponse({ status: 200, description: 'Mapped HSN codes retrieved' })
  async getHsnsForCategory(@Param('catId') catId: string) {
    const result = await this.mappingService.getHsnsForCategory(catId);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Mapped HSN codes fetched successfully.',
      data: result,
    };
  }

  @Post('hsn-codes/:hsnId/categories')
  @ApiOperation({
    summary: 'Map product category to HSN code',
  })
  @ApiParam({ name: 'hsnId', description: 'HSN Code UUID' })
  @ApiResponse({ status: 201, description: 'Category mapped to HSN' })
  async mapCategory(@Param('hsnId') hsnId: string, @Body() dto: MapHsnCategoryDto) {
    const result = await this.mappingService.mapCategory(hsnId, dto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'Category mapped to HSN successfully.',
      data: result,
    };
  }

  @Delete('hsn-codes/:hsnId/categories/:catId')
  @ApiOperation({
    summary: 'Unmap product category from HSN code',
  })
  @ApiParam({ name: 'hsnId', description: 'HSN Code UUID' })
  @ApiParam({ name: 'catId', description: 'Product Category UUID' })
  @ApiResponse({ status: 200, description: 'Category unmapped from HSN' })
  async unmapCategory(
    @Param('hsnId') hsnId: string,
    @Param('catId') catId: string,
  ) {
    const result = await this.mappingService.unmapCategory(hsnId, catId);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }

  @Post('catalog/seed-baseline-mappings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Seed baseline HSN ↔ Category mappings for ceramic & electronics ecosystem',
  })
  @ApiResponse({ status: 200, description: 'Baseline mappings seeded' })
  async seedBaselineMappings() {
    const result = await this.mappingService.seedBaselineMappings();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Baseline HSN ↔ Category mappings seeded successfully.',
      data: result,
    };
  }
}
