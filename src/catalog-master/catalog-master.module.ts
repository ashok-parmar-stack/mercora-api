import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HsnCodeEntity } from './hsn-codes/entities/hsn-code.entity';
import { MasterSyncRunEntity } from '../database/entities/master-sync-run.entity';
import { MasterSyncErrorEntity } from '../database/entities/master-sync-error.entity';
import { ProductCategoryEntity } from './product-categories/entities/product-category.entity';
import { HsnCodeCategoryEntity } from './mappings/entities/hsn-code-category.entity';
import { StatusEntity } from '../database/entities/status.entity';

import { HsnCodesService } from './hsn-codes/services/hsn-codes.service';
import { HsnSyncService } from './hsn-codes/services/hsn-sync.service';
import { IcegateSourceAdapter } from './hsn-codes/adapters/icegate-source.adapter';
import { HsnCodesController } from './hsn-codes/controllers/hsn-codes.controller';

import { ProductCategoriesService } from './product-categories/services/product-categories.service';
import { ProductCategoriesController } from './product-categories/controllers/product-categories.controller';

import { HsnCategoryMappingService } from './mappings/services/hsn-category-mapping.service';
import { HsnCategoryMappingController } from './mappings/controllers/hsn-category-mapping.controller';

import { SharedModule } from '../common/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HsnCodeEntity,
      MasterSyncRunEntity,
      MasterSyncErrorEntity,
      ProductCategoryEntity,
      HsnCodeCategoryEntity,
      StatusEntity,
    ]),
    SharedModule,
  ],

  controllers: [
    HsnCodesController,
    ProductCategoriesController,
    HsnCategoryMappingController,
  ],
  providers: [
    HsnCodesService,
    HsnSyncService,
    IcegateSourceAdapter,
    ProductCategoriesService,
    HsnCategoryMappingService,
  ],
  exports: [
    HsnCodesService,
    HsnSyncService,
    ProductCategoriesService,
    HsnCategoryMappingService,
  ],
})
export class CatalogMasterModule {}
