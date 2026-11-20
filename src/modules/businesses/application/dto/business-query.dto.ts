import { IsOptional, IsString, IsBoolean, IsIn, IsInt, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class BusinessQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  verifiedOnly?: boolean;

  @IsOptional()
  @IsIn(['relevance', 'rating', 'reviews', 'established'])
  sortBy?: 'relevance' | 'rating' | 'reviews' | 'established';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 12;
}
