import { BusinessCategoryOrmEntity } from "../entities/business-category.orm-entity";
import { BusinessCategoryEntity } from "../../../domain/entities/business-category.entity";
import { BusinessCategoryStatus } from "../../../domain/enums/business-category-status.enum";

export class BusinessCategoryMapper {
  static toDomain(orm: BusinessCategoryOrmEntity): BusinessCategoryEntity {
    return new BusinessCategoryEntity(
      orm.id,
      orm.name,
      orm.code,
      orm.slug,
      orm.type || 'general',
      orm.description || undefined,
      orm.icon || undefined,
      orm.displayOrder,
      (orm.status as BusinessCategoryStatus) || BusinessCategoryStatus.ACTIVE,
      orm.businessCount,
      orm.createdAt,
      orm.updatedAt
    );
  }

  static toOrm(domain: BusinessCategoryEntity): BusinessCategoryOrmEntity {
    const orm = new BusinessCategoryOrmEntity();
    orm.id = domain.id;
    orm.name = domain.name;
    orm.code = domain.code;
    orm.slug = domain.slug;
    orm.type = domain.type;
    orm.description = domain.description;
    orm.icon = domain.icon;
    orm.displayOrder = domain.displayOrder;
    orm.status = domain.status;
    orm.businessCount = domain.businessCount;
    return orm;
  }
}
