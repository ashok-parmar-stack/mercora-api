import { IsNotEmpty, IsString, IsOptional, IsInt, Min, IsEnum } from "class-validator";
import { BusinessCategoryStatus } from "../../domain/enums/business-category-status.enum";

export class CreateBusinessCategoryDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsEnum(BusinessCategoryStatus)
  status?: BusinessCategoryStatus;
}
