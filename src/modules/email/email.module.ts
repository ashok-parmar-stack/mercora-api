import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EmailTemplateEntity } from '../../database/entities/email-template.entity';
import { EmailLogEntity } from '../../database/entities/email-log.entity';
import { EmailTemplateService } from './services/email-template.service';
import { MailerService } from './services/mailer.service';
import { EmailDispatcherService } from './services/email-dispatcher.service';
import { EmailController } from './email.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailTemplateEntity, EmailLogEntity]),
    ConfigModule,
  ],
  controllers: [EmailController],
  providers: [
    EmailTemplateService,
    MailerService,
    EmailDispatcherService,
  ],
  exports: [
    EmailTemplateService,
    MailerService,
    EmailDispatcherService,
  ],
})
export class EmailModule {}
