import * as crypto from 'crypto';
import { EXTERNAL_APIS, ExternalApisConfig } from './external-apis.config';

const ephemeralDevSecrets = new Map<string, string>();

function resolveJwtSecret(envKey: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const configured = process.env[envKey]?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[Security Config] Missing or weak ${envKey} in production environment (minimum 16 characters required).`,
    );
  }

  if (!ephemeralDevSecrets.has(envKey)) {
    ephemeralDevSecrets.set(envKey, crypto.randomBytes(32).toString('hex'));
  }
  return ephemeralDevSecrets.get(envKey)!;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  appName: string;
  appDescription: string;
  appVersion: string;
  corsOrigin: string;
  externalApis: ExternalApisConfig;
  database: {
    type: 'sqlite' | 'postgres';
    url?: string;
    host: string;
    port: number;
    username?: string;
    password?: string;
    database: string;
    sqlitePath: string;
    ssl?: boolean;
    synchronize: boolean;
    logging: boolean;
  };
  elasticsearch: {
    enabled: boolean;
    node: string;
    index: string;
    apiKey?: string;
  };
  swagger: {
    enabled: boolean;
    path: string;
  };
  auth: {
    jwtAccessSecret: string;
    jwtRefreshSecret: string;
    accessTokenExpiresIn: string;
    refreshTokenExpiresIn: string;
    sessionInactivityHours: number;
    frontendUrl: string;
  };
  mail: {
    host: string;
    port: number;
    user?: string;
    pass?: string;
    from: string;
    secure: boolean;
    devMode: boolean;
    defaultCurrency: string;
    defaultCurrencySymbol: string;
  };
  storage: {
    driver: 's3' | 'local';
    bucketName: string;
    region: string;
    endpointUrl: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    publicUrl: string;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'Mercora B2B Platform API',
  appDescription: process.env.APP_DESCRIPTION || 'NestJS + TypeORM + Elasticsearch B2B Platform Engine',
  appVersion: process.env.APP_VERSION || '1.0.0',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:9000,http://127.0.0.1:9000',
  externalApis: EXTERNAL_APIS,
  database: {
    type: (process.env.DB_TYPE as 'sqlite' | 'postgres') || 'postgres',
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
    database: process.env.DB_NAME || process.env.DB_DATABASE || 'mercora_db',
    sqlitePath: process.env.SQLITE_PATH || './mercora.sqlite',
    ssl: process.env.DB_SSL === 'true' || Boolean(process.env.DATABASE_URL?.includes('sslmode=require')),
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },
  elasticsearch: {
    enabled: process.env.ELASTICSEARCH_ENABLED === 'true',
    node: process.env.ELASTICSEARCH_NODE || '',
    index: process.env.ELASTICSEARCH_INDEX || 'mercora_businesses',
    apiKey: process.env.ELASTICSEARCH_API_KEY || undefined,
  },
  swagger: {
    enabled:
      process.env.SWAGGER_ENABLED === 'true' ||
      (process.env.SWAGGER_ENABLED !== 'false' && process.env.NODE_ENV !== 'production'),
    path: process.env.SWAGGER_PATH || 'api/docs',
  },
  auth: {
    jwtAccessSecret: resolveJwtSecret('JWT_ACCESS_SECRET'),
    jwtRefreshSecret: resolveJwtSecret('JWT_REFRESH_SECRET'),
    accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
    sessionInactivityHours: parseInt(process.env.SESSION_INACTIVITY_HOURS || '168', 10), // 7 days default
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:9000',
  },
  mail: {
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Mercora Support <no-reply@mercora.com>',
    secure: process.env.SMTP_SECURE === 'true',
    devMode: process.env.MAIL_DEV_MODE !== 'false',
    defaultCurrency: process.env.DEFAULT_CURRENCY || 'INR',
    defaultCurrencySymbol: process.env.DEFAULT_CURRENCY_SYMBOL || '₹',
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER as 's3' | 'local') || 's3',
    bucketName: process.env.STORAGE_BUCKET_NAME || 'assets',
    region: process.env.AWS_REGION || 'us-east-2',
    endpointUrl: process.env.AWS_ENDPOINT_URL_S3 || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE !== 'false',
    publicUrl: process.env.NEXT_PUBLIC_STORAGE_URL || '/uploads',
  },
});
