import { IsOptional, IsString, IsEnum, IsNumber } from "class-validator";
import { Type } from "class-transformer";
import { CategoryStatus } from "../../domain/enums/category-status.enum";

export class CategoryQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsEnum(CategoryStatus)
  status?: CategoryStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
