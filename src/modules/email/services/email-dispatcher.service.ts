import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailLogEntity } from '../../../database/entities/email-log.entity';
import { EmailTemplateService } from './email-template.service';
import { MailerService } from './mailer.service';
import { SendEmailOptions, SendMailResult } from '../interfaces/email.interface';
import { MercoraLogger } from '../../../common/logger';

@Injectable()
export class EmailDispatcherService {
  private readonly logger = new MercoraLogger(EmailDispatcherService.name);

  constructor(
    @InjectRepository(EmailLogEntity)
    private readonly logRepo: Repository<EmailLogEntity>,
    private readonly templateService: EmailTemplateService,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * Non-blocking async email dispatch (never slows down HTTP responses)
   */
  sendAsync(options: SendEmailOptions): void {
    setImmediate(async () => {
      try {
        await this.dispatch(options);
      } catch (err) {
        this.logger.error(`Async email dispatch failed for [${options.to}]: ${err.message}`, err.stack);
      }
    });
  }

  /**
   * Synchronous email dispatch with full audit log update
   */
  async sendSync(options: SendEmailOptions): Promise<SendMailResult> {
    return this.dispatch(options);
  }

  private async dispatch(options: SendEmailOptions): Promise<SendMailResult> {
    const { to, templateCode, context, userId, subjectOverride } = options;

    let templateId: string | undefined;
    let subject = '';
    let body = '';

    try {
      const compiled = await this.templateService.compile(templateCode, context);
      subject = subjectOverride || compiled.subject;
      body = compiled.body;
      templateId = compiled.templateId;
    } catch (compileErr) {
      this.logger.error(`Failed compiling email template [${templateCode}]: ${compileErr.message}`);
      return { success: false, error: compileErr.message };
    }

    // 1. Create audit log entry in PENDING state
    let emailLog: EmailLogEntity | null = null;
    try {
      emailLog = this.logRepo.create({
        templateId,
        userId,
        recipientEmail: to,
        subject,
        status: 'PENDING',
      });
      await this.logRepo.save(emailLog);
    } catch (dbErr) {
      this.logger.warn(`Could not create initial email log entry: ${dbErr.message}`);
    }

    // 2. Perform dispatch via mailer
    const sendResult = await this.mailerService.sendMail(to, subject, body);

    // 3. Update audit log entry
    if (emailLog && emailLog.id) {
      try {
        if (sendResult.success) {
          emailLog.status = 'SENT';
          emailLog.providerMessageId = sendResult.messageId || null;
          emailLog.sentAt = new Date();
        } else {
          emailLog.status = 'FAILED';
          emailLog.errorMessage = sendResult.error || 'Unknown dispatch error';
        }
        await this.logRepo.save(emailLog);
      } catch (updateErr) {
        this.logger.warn(`Could not update email log status: ${updateErr.message}`);
      }
    }

    return sendResult;
  }
}
