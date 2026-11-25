import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import {
  IBusinessRepository,
  BUSINESS_REPOSITORY_TOKEN,
} from "../../../domain/repositories/business.repository.interface";
import { API_MESSAGES } from "../../../../../common/messages";

@Injectable()
export class DeleteBusinessUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.businessRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(API_MESSAGES.businesses.notFound);
    }
    await this.businessRepository.delete(id);
  }
}
