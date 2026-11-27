import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EmailTemplateEntity } from '../../../database/entities/email-template.entity';
import { StatusEntity } from '../../../database/entities/status.entity';
import { EmailContext } from '../interfaces/email.interface';
import { SYSTEM_EMAIL_TEMPLATES } from '../templates/default-templates';
import { MercoraLogger } from '../../../common/logger';

@Injectable()
export class EmailTemplateService implements OnModuleInit {
  private readonly logger = new MercoraLogger(EmailTemplateService.name);

  constructor(
    @InjectRepository(EmailTemplateEntity)
    private readonly templateRepo: Repository<EmailTemplateEntity>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultTemplates();
  }

  /**
   * Seed system templates if they don't already exist in the database
   */
  async seedDefaultTemplates(): Promise<void> {
    try {
      for (const tpl of SYSTEM_EMAIL_TEMPLATES) {
        const existing = await this.templateRepo.findOne({
          where: { code: tpl.code },
        });

        if (!existing) {
          const newTemplate = this.templateRepo.create({
            code: tpl.code,
            name: tpl.name,
            subject: tpl.subject,
            description: tpl.description,
            body: tpl.body,
            variables: tpl.variables,
            isSystem: true,
          });
          await this.templateRepo.save(newTemplate);
          this.logger.log(`Seeded default email template: [${tpl.code}]`);
        }
      }
    } catch (error) {
      this.logger.warn(`Could not seed email templates: ${error.message}`);
    }
  }

  /**
   * Fetch all email templates
   */
  async getAllTemplates(): Promise<EmailTemplateEntity[]> {
    try {
      return await this.templateRepo.find({
        relations: ['status'],
        order: { name: 'ASC' },
      });
    } catch {
      return [];
    }
  }

  /**
   * Fetch template entity by code
   */
  async getTemplate(code: string): Promise<EmailTemplateEntity | null> {
    const tpl = await this.templateRepo.findOne({ where: { code } });
    if (tpl) return tpl;

    // Fallback to in-memory seeds if DB record is somehow missing
    const seed = SYSTEM_EMAIL_TEMPLATES.find((s) => s.code === code);
    if (!seed) return null;

    return {
      id: 'default-' + code,
      code: seed.code,
      name: seed.name,
      subject: seed.subject,
      description: seed.description,
      body: seed.body,
      variables: seed.variables,
      statusId: null,
      status: null,
      isSystem: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as EmailTemplateEntity;
  }

  async deleteTemplate(id: string): Promise<{ deleted: number }> {
    const existing = await this.templateRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Email template ${id} not found`);
    }
    await this.templateRepo.softDelete(id);
    return { deleted: 1 };
  }

  async bulkDeleteTemplates(ids: string[]): Promise<{ deleted: number }> {
    if (!ids.length) return { deleted: 0 };
    const result = await this.templateRepo.softDelete({ id: In(ids) });
    return { deleted: result.affected || 0 };
  }

  async bulkUpdateStatus(ids: string[], targetStatus: 'ACTIVE' | 'INACTIVE'): Promise<{ updated: number }> {
    if (!ids.length) return { updated: 0 };
    const statusRepo = this.templateRepo.manager.getRepository(StatusEntity);
    const statusEntity = await statusRepo.findOne({ where: { code: targetStatus } });
    if (!statusEntity) {
      return { updated: 0 };
    }
    const result = await this.templateRepo.update(
      { id: In(ids) },
      { statusId: statusEntity.id },
    );
    return { updated: result.affected || 0 };
  }

  /**
   * Compile template subject and HTML body with dynamic variables, currency, and locale
   */
  async compile(
    templateCode: string,
    userContext: EmailContext,
  ): Promise<{ subject: string; body: string; templateId?: string }> {
    const template = await this.getTemplate(templateCode);
    if (!template) {
      throw new Error(`Email template with code [${templateCode}] not found`);
    }

    const appName = this.configService.get<string>('appName') || 'Mercora';
    const frontendUrl =
      this.configService.get<string>('auth.frontendUrl') ||
      'http://localhost:9000';
    const supportEmail =
      this.configService.get<string>('mail.from') || 'support@mercora.com';
    const defaultCurrency =
      this.configService.get<string>('mail.defaultCurrency') || 'INR';
    const defaultCurrencySymbol =
      this.configService.get<string>('mail.defaultCurrencySymbol') || '₹';

    // Global enriched context
    const fullContext: EmailContext = {
      app_name: appName,
      app_url: frontendUrl,
      support_email: supportEmail,
      currency_code: userContext.currency_code || defaultCurrency,
      currency_symbol: userContext.currency_symbol || defaultCurrencySymbol,
      year: new Date().getFullYear(),
      ...userContext,
    };

    const subject = this.interpolate(template.subject, fullContext);
    const body = this.interpolate(template.body, fullContext);

    return {
      subject,
      body,
      templateId: template.id.startsWith('default-') ? undefined : template.id,
    };
  }

  /**
   * Dynamic string replacement for {{variable_name}} placeholders
   */
  private interpolate(text: string, context: Record<string, any>): string {
    if (!text) return '';
    return text.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key) => {
      if (context[key] !== undefined && context[key] !== null) {
        return String(context[key]);
      }
      return '';
    });
  }
}
