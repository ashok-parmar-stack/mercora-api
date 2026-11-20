import { Injectable } from '@nestjs/common';
import { FindStatusService } from './services';

/**
 * StatusesService (Facade)
 * ─────────────────────────────────────────────────────────────────────────────
 * Delegates to FindStatusService.
 */
@Injectable()
export class StatusesService {
  constructor(private readonly findService: FindStatusService) {}

  findAll(type?: string) {
    return this.findService.findAll(type);
  }

  findOne(idOrCode: string) {
    return this.findService.findOne(idOrCode);
  }
}
