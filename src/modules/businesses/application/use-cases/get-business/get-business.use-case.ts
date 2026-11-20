import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import {
  IBusinessRepository,
  BUSINESS_REPOSITORY_TOKEN,
} from "../../../domain/repositories/business.repository.interface";
import { BusinessResponseDto } from "../../dto/business-response.dto";
import { API_MESSAGES } from "../../../../../config/messages.config";

@Injectable()
export class GetBusinessUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository
  ) {}

  async execute(slugOrId: string): Promise<BusinessResponseDto> {
    let business = await this.businessRepository.findBySlug(slugOrId);
    if (!business) {
      business = await this.businessRepository.findById(slugOrId);
    }

    if (!business) {
      throw new NotFoundException(API_MESSAGES.businesses.notFound);
    }

    return BusinessResponseDto.fromDomain(business);
  }
}
