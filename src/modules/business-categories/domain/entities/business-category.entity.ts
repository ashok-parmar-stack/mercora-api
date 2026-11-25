import { BusinessCategoryStatus } from "../enums/business-category-status.enum";

export class BusinessCategoryEntity {
  constructor(
    public readonly id: string,
    public name: string,
    public code: string,
    public slug: string,
    public type: string,
    public description?: string,
    public icon?: string,
    public displayOrder: number = 0,
    public status: BusinessCategoryStatus = BusinessCategoryStatus.ACTIVE,
    public businessCount: number = 0,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date(),
    public parentId?: string | null,
    public isActiveStatus: boolean = true,
    public subcategories?: BusinessCategoryEntity[]
  ) {}

  isActive(): boolean {
    return this.status === BusinessCategoryStatus.ACTIVE && this.isActiveStatus;
  }
}
