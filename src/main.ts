import './common/database';
import 'class-validator';
import 'class-transformer';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { loggerConfig, MercoraLogger } from './common/logger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(loggerConfig),
    bufferLogs: true,
  });

  const logger = new MercoraLogger('MercoraBootstrap');
  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 5001;
  const swaggerPath = configService.get<string>('swagger.path') || 'api/docs';

  app.enableShutdownHooks();
  configureApp(app);

  logger.lifecycle(`Swagger OpenAPI Documentation available at http://localhost:${port}/${swaggerPath}`);
  await app.listen(port, '0.0.0.0');
  logger.lifecycle(`NestJS Backend server is running on http://localhost:${port}/api`);
}

bootstrap();

