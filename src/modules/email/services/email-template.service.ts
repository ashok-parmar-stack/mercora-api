import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EmailTemplateEntity } from '../../../database/entities/email-template.entity';
import { EmailContext } from '../interfaces/email.interface';
import { SYSTEM_EMAIL_TEMPLATES } from '../templates/default-templates';

@Injectable()
export class EmailTemplateService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplateService.name);

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
      return await this.templateRepo.find({ order: { name: 'ASC' } });
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
