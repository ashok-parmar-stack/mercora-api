import { Injectable } from '@nestjs/common';
import { MSG, AppMessages } from './messages.constants';

/**
 * MessageService
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized dynamic message provider.
 * Supports token templating (e.g. `{{name}}`, `{{field}}`), dynamic fallback,
 * and direct access to typed message constants.
 *
 * Changing a template or string in `messages.constants.ts` automatically
 * updates messages returned across every service, DTO, and controller.
 */
@Injectable()
export class MessageService {
  /** Access the typed MSG configuration directly */
  readonly msg: AppMessages = MSG;

  /**
   * Interpolate tokens in a template string.
   * "User {{name}} with email {{email}} not found" + { name: 'Admin', email: 'a@m.com' }
   * → "User Admin with email a@m.com not found"
   */
  interpolate(template: string, params: Record<string, string | number | boolean>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      return key in params ? String(params[key]) : `{{${key}}}`;
    });
  }

  /**
   * Get dynamic delete message according to mode.
   */
  getDeleteMessage(entity: string, mode: 'SOFT' | 'HARD' | 'STATUS' = 'SOFT'): string {
    return MSG.DELETED(entity, mode);
  }

  /**
   * Format entity not found message.
   */
  getNotFoundMessage(entity: string, identifier: string): string {
    return MSG.NOT_FOUND_BY_IDENTIFIER(entity, identifier);
  }

  /**
   * Format duplicate field message.
   */
  getAlreadyExistsMessage(entity: string, field: string, value: string): string {
    return MSG.ALREADY_EXISTS(entity, field, value);
  }
}
