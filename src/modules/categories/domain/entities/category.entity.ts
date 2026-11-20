import { CategoryStatus } from "../enums/category-status.enum";

export class CategoryEntity {
  constructor(
    public readonly id: string,
    public name: string,
    public slug: string,
    public description?: string,
    public parentId?: string | null,
    public status: CategoryStatus = CategoryStatus.ACTIVE,
    public displayOrder: number = 0,
    public iconUrl?: string,
    public productCount: number = 0,
    public businessCount: number = 0,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  isActive(): boolean {
    return this.status === CategoryStatus.ACTIVE;
  }
}
