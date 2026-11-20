import { Injectable, Inject } from '@nestjs/common';
import {
  IBusinessRepository,
  IBusinessRepositoryToken,
} from '../../domain/interfaces/business-repository.interface';
import { BusinessResponseDto } from '../dto/business-response.dto';

@Injectable()
export class GetFeaturedBusinessesUseCase {
  constructor(
    @Inject(IBusinessRepositoryToken)
    private readonly businessRepository: IBusinessRepository
  ) {}

  async execute(limit: number = 6) {
    const businesses = await this.businessRepository.findFeatured(limit);
    return BusinessResponseDto.fromDomainList(businesses);
  }
}
