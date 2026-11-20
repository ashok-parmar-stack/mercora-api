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
import { ProductCategoriesService } from '../services/product-categories.service';
import {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
  CategoryQueryDto,
  MoveCategoryDto,
} from '../dto';

@ApiTags('Catalog Master - Product Categories')
@Controller('v1/admin/product-categories')
export class ProductCategoriesController {
  constructor(private readonly categoriesService: ProductCategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'List product categories with pagination & filtering',
    description: 'Retrieves categories with optional parent_id, roots_only, level, search, and status filters.',
  })
  @ApiResponse({ status: 200, description: 'Paginated product categories retrieved' })
  async findAll(@Query() query: CategoryQueryDto) {
    const result = await this.categoriesService.findAll(query);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Product categories fetched successfully.',
      data: result,
    };
  }

  @Get('tree')
  @ApiOperation({
    summary: 'Get full infinite Flipkart-style product category tree',
    description: 'Returns nested root -> child -> subchild hierarchy tree with mapped HSN counts.',
  })
  @ApiResponse({ status: 200, description: 'Category tree retrieved' })
  async getTree() {
    const result = await this.categoriesService.findTree();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Product category tree fetched successfully.',
      data: result,
    };
  }

  @Post('seed-baseline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Seed standard baseline product categories',
    description: 'Populates Ceramic & Tiles (Floor, Wall, Outdoor, Sanitaryware, Raw Materials) and Electronics baseline tree.',
  })
  @ApiResponse({ status: 200, description: 'Baseline categories seeded' })
  async seedBaseline() {
    const result = await this.categoriesService.seedBaselineCategories();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Baseline categories seeded successfully.',
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get single category details by UUID, code, or slug',
  })
  @ApiParam({ name: 'id', description: 'Category UUID, Code, or Slug' })
  @ApiResponse({ status: 200, description: 'Product category found' })
  async findOne(@Param('id') id: string) {
    const result = await this.categoriesService.findOne(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Product category fetched successfully.',
      data: result,
    };
  }

  @Get(':id/children')
  @ApiOperation({
    summary: 'Get direct child categories',
  })
  @ApiParam({ name: 'id', description: 'Parent Category UUID' })
  @ApiResponse({ status: 200, description: 'Child categories retrieved' })
  async findChildren(@Param('id') id: string) {
    const result = await this.categoriesService.findChildren(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Child categories fetched successfully.',
      data: result,
    };
  }

  @Get(':id/path')
  @ApiOperation({
    summary: 'Get breadcrumb path trail from Root to this category',
  })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Breadcrumb path trail retrieved' })
  async getBreadcrumbPath(@Param('id') id: string) {
    const result = await this.categoriesService.findBreadcrumbPath(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Breadcrumb path fetched successfully.',
      data: result,
    };
  }

  @Post()
  @ApiOperation({
    summary: 'Create new product category node',
  })
  @ApiResponse({ status: 201, description: 'Category created' })
  async create(@Body() dto: CreateProductCategoryDto) {
    const result = await this.categoriesService.create(dto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'Product category created successfully.',
      data: result,
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update product category details',
  })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category updated' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductCategoryDto) {
    const result = await this.categoriesService.update(id, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Product category updated successfully.',
      data: result,
    };
  }

  @Patch(':id/move')
  @ApiOperation({
    summary: 'Move / Reparent category safely to another parent (or Root)',
    description: 'Guards against cyclical references and automatically re-indexes level & path for all sub-tree children.',
  })
  @ApiParam({ name: 'id', description: 'Category UUID to move' })
  @ApiResponse({ status: 200, description: 'Category reparented' })
  async moveCategory(@Param('id') id: string, @Body() dto: MoveCategoryDto) {
    const result = await this.categoriesService.moveCategory(id, dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Product category reparented successfully.',
      data: result,
    };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete product category node',
  })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  async remove(@Param('id') id: string) {
    const result = await this.categoriesService.remove(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: result.message,
      data: result,
    };
  }
}
