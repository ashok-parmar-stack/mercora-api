import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import {
  IBusinessRepository,
  BUSINESS_REPOSITORY_TOKEN,
} from "../../../domain/repositories/business.repository.interface";
import { UpdateBusinessDto } from "./update-business.dto";
import { BusinessResponseDto } from "../../dto/business-response.dto";
import { API_MESSAGES } from "../../../../../config/messages.config";

@Injectable()
export class UpdateBusinessUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY_TOKEN)
    private readonly businessRepository: IBusinessRepository
  ) {}

  async execute(id: string, dto: UpdateBusinessDto): Promise<BusinessResponseDto> {
    const existing = await this.businessRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(API_MESSAGES.businesses.notFound);
    }

    if (dto.name) existing.name = dto.name;
    if (dto.category) existing.category = dto.category;
    if (dto.businessType) existing.businessType = dto.businessType;
    if (dto.city) existing.city = dto.city;
    if (dto.state) existing.state = dto.state;
    if (dto.description) existing.description = dto.description;
    if (dto.phone) existing.phone = dto.phone;
    if (dto.email) existing.email = dto.email;
    if (dto.website) existing.website = dto.website;
    if (dto.address) existing.address = dto.address;

    const saved = await this.businessRepository.save(existing);
    return BusinessResponseDto.fromDomain(saved);
  }
}
