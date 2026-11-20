import { CategoryEntity } from "../../../domain/entities/category.entity";
import { CategoryOrmEntity } from "../entities/category.orm-entity";

export class CategoryMapper {
  static toDomain(orm: CategoryOrmEntity): CategoryEntity {
    return new CategoryEntity(
      orm.id,
      orm.name,
      orm.slug,
      orm.description,
      orm.parentId,
      orm.status,
      orm.displayOrder,
      orm.iconUrl,
      orm.productCount,
      orm.businessCount,
      orm.createdAt,
      orm.updatedAt
    );
  }

  static toOrm(domain: CategoryEntity): CategoryOrmEntity {
    const orm = new CategoryOrmEntity();
    orm.id = domain.id;
    orm.name = domain.name;
    orm.slug = domain.slug;
    orm.description = domain.description;
    orm.parentId = domain.parentId;
    orm.status = domain.status;
    orm.displayOrder = domain.displayOrder;
    orm.iconUrl = domain.iconUrl;
    orm.productCount = domain.productCount;
    orm.businessCount = domain.businessCount;
    return orm;
  }
}
