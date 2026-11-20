import {
  INestApplication,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import type { Express } from 'express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Shared HTTP configuration applied to both standalone NestJS server (`main.ts`)
 * and Vercel serverless function (`api/index.ts`).
 *
 * Configures:
 *  - Disabling `x-powered-by`
 *  - Global route prefix (`/api`)
 *  - CORS with configurable origins and max-age
 *  - Structured ValidationPipe with Nexie-style flattened error formatting
 *  - Swagger OpenAPI Documentation setup
 */
export function configureApp(app: INestApplication): void {
  // 1. Security: Disable Express x-powered-by header
  try {
    const expressApp = app.getHttpAdapter().getInstance() as Express;
    if (expressApp && typeof expressApp.disable === 'function') {
      expressApp.disable('x-powered-by');
    }
  } catch {
    // Non-express adapter fallback
  }

  const configService = app.get(ConfigService);
  const appName = configService.get<string>('appName') || 'Mercora B2B Platform API';
  const appDescription =
    configService.get<string>('appDescription') ||
    'NestJS + TypeORM + Elasticsearch B2B Platform Engine';
  const appVersion = configService.get<string>('appVersion') || '1.0.0';
  const swaggerEnabled = configService.get<boolean>('swagger.enabled') ?? true;
  const swaggerPath = configService.get<string>('swagger.path') || 'api/docs';

  // 2. Global Validation Pipe with Nexie-style flattened error formatting
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        const formattedErrors: Record<string, string> = {};

        errors.forEach((error) => {
          const constraints = error.constraints || {};
          if (constraints.isNotEmpty) {
            formattedErrors[error.property] = constraints.isNotEmpty;
          } else {
            formattedErrors[error.property] =
              Object.values(constraints)[0] || `${error.property} is invalid`;
          }
        });

        const firstMessage =
          Object.values(formattedErrors)[0] || 'Validation failed';

        return new UnprocessableEntityException({
          statusCode: 422,
          message: firstMessage,
          errors: formattedErrors,
        });
      },
    }),
  );

  // 3. Global route prefix
  app.setGlobalPrefix('api');

  // 4. CORS configuration
  const configuredCors = configService.get<string>('corsOrigin');
  app.enableCors({
    origin:
      configuredCors && configuredCors !== '*'
        ? configuredCors.split(',').map((s: string) => s.trim())
        : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    maxAge: 86400,
  });

  // 5. Swagger OpenAPI Documentation Setup
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(appName)
      .setDescription(
        `${appDescription}\n\n` +
          `• **TypeORM Database:** Configured via \`ConfigService\` (.env)\n` +
          `• **RBAC & UBAC Engine:** Prioritized user overrides with role default matrix\n` +
          `• **Elasticsearch Client:** Connected & cluster health monitored\n` +
          `• **Health API:** \`/api/health\` for uptime, cluster status, and telemetry\n` +
          `• **Storage System:** S3-compatible file storage (AWS S3, MinIO, Cloudflare R2)\n` +
          `• **Theme System:** Centralized color tokens (\`@mercora/theme-config\`)`,
      )
      .setVersion(appVersion)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
        'bearer',
      )
      .addTag(
        'Authentication & Sessions',
        'Single active session login, registration, email confirmation, password recovery, and token rotation',
      )
      .addTag(
        'Users',
        'User CRUD with URL slugs, role assignment, and user permission override matrix',
      )
      .addTag(
        'Roles',
        'Role management and granular role-to-action permission matrix',
      )
      .addTag(
        'Permissions',
        'Permission modules and permission action catalog',
      )
      .addTag(
        'Statuses',
        'System status catalog for Users, Roles, Permissions, and Companies',
      )
      .addTag(
        'Geographic Master - Countries',
        'Country master CRUD, ISO code verification, and status controls',
      )
      .addTag(
        'Storage / File Uploads',
        'S3-compatible direct upload, presigned URLs, and file deletion',
      )
      .addTag(
        'Health & Telemetry',
        'Health checks for TypeORM database, Elasticsearch cluster, and memory telemetry',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document, {
      customSiteTitle: `${appName} Swagger Documentation`,
      customCss: `
        .swagger-ui .topbar { background-color: #282828; border-bottom: 2px solid #ee3135; }
        .swagger-ui .btn.authorize { background-color: #ee3135; border-color: #ee3135; color: #fff; }
      `,
      customCssUrl: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui.min.css',
      ],
      customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-bundle.js',
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-standalone-preset.js',
      ],
      customfavIcon: 'https://swagger.io/favicon-32x32.png',
    });
  }
}
