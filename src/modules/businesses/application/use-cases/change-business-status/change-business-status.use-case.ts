import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import {
  IBusinessRepository,
  BUSINESS_REPOSITORY_TOKEN,
} from "../../../domain/repositories/business.repository.interface";
import { ChangeBusinessStatusDto } from "./change-business-status.dto";
import { BusinessResponseDto } from "../../dto/business-response.dto";
import { API_MESSAGES } from "../../../../../common/messages";

@Injectable()
export class ChangeBusinessStatusUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository
  ) {}

  async execute(id: string, dto: ChangeBusinessStatusDto): Promise<BusinessResponseDto> {
    const updated = await this.businessRepository.updateStatus(id, dto.status);
    if (!updated) {
      throw new NotFoundException(API_MESSAGES.businesses.notFound);
    }
    return BusinessResponseDto.fromDomain(updated);
  }
}
