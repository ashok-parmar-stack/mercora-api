import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SendMailResult } from '../interfaces/email.interface';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter(): void {
    const mailConfig = this.configService.get('mail');
    if (!mailConfig) return;

    if (mailConfig.user && mailConfig.pass) {
      this.transporter = nodemailer.createTransport({
        host: mailConfig.host,
        port: mailConfig.port,
        secure: mailConfig.secure,
        auth: {
          user: mailConfig.user,
          pass: mailConfig.pass,
        },
      });
      this.logger.log(`Configured SMTP Mailer for host: ${mailConfig.host}:${mailConfig.port}`);
    } else {
      this.logger.log(`SMTP credentials not provided; Dev/Console Mailer active for local simulation.`);
    }
  }

  /**
   * Send compiled email
   */
  async sendMail(
    to: string,
    subject: string,
    html: string,
  ): Promise<SendMailResult> {
    const mailConfig = this.configService.get('mail');
    const from = mailConfig?.from || 'Mercora <no-reply@mercora.com>';

    // Always log clean preview in development/devMode
    if (mailConfig?.devMode) {
      this.logDevEmailPreview(to, subject, html);
    }

    if (!this.transporter) {
      // In dev mode without SMTP, simulated dispatch succeeds
      return {
        success: true,
        messageId: `dev-sim-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      };
    }

    try {
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });

      this.logger.log(`Dispatched email to [${to}] - MessageId: ${info.messageId}`);
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      this.logger.error(`Failed to send email to [${to}]: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Pretty terminal preview for developer testing
   */
  private logDevEmailPreview(to: string, subject: string, html: string): void {
    const links = this.extractLinks(html);
    const linkPreview = links.length > 0 ? `\n   🔗 Action Links:\n   ${links.join('\n   ')}` : '';

    this.logger.log(
      `\n┌─────────────────────────────────────────────────────────────┐\n` +
      `│ 📧 DEV EMAIL SIMULATION                                     │\n` +
      `├─────────────────────────────────────────────────────────────┤\n` +
      `│ To:      ${to}\n` +
      `│ Subject: ${subject}\n` +
      `│ Status:  SUCCESS (Simulated)                                │\n` +
      `└─────────────────────────────────────────────────────────────┘` +
      linkPreview + '\n'
    );
  }

  private extractLinks(html: string): string[] {
    const matches = html.match(/href="([^"]+)"/g) || [];
    return matches.map((m) => m.replace(/href="|"/g, ''));
  }
}
