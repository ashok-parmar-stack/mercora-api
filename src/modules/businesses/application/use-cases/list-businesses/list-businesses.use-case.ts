import { Injectable, Inject } from "@nestjs/common";
import {
  IBusinessRepository,
  BUSINESS_REPOSITORY_TOKEN,
  BusinessFindAllOptions,
  PaginatedResult,
} from "../../../domain/repositories/business.repository.interface";
import { BusinessResponseDto } from "../../dto/business-response.dto";

@Injectable()
export class ListBusinessesUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository
  ) {}

  async execute(options: BusinessFindAllOptions): Promise<PaginatedResult<BusinessResponseDto>> {
    const result = await this.businessRepository.findAll(options);
    return {
      data: result.data.map((entity) => BusinessResponseDto.fromDomain(entity)),
      total: result.total,
      totalCount: result.totalCount,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }
}
