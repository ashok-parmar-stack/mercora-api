import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import { format, transports } from 'winston';
import type { WinstonModuleOptions } from 'nest-winston';

const isServerless = Boolean(
  process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NOW_REGION,
);

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const resolvedLevel =
  process.env.LOG_LEVEL ||
  (isProduction ? 'info' : isTest ? 'warn' : 'debug');

const timestampFormat = format.timestamp({
  format: 'YYYY-MM-DD HH:mm:ss.SSS',
});

const prodJsonFormat = format.combine(
  timestampFormat,
  format.errors({ stack: true }),
  format.splat(),
  format.json(),
);

const devConsoleFormat = format.combine(
  timestampFormat,
  format.errors({ stack: true }),
  nestWinstonModuleUtilities.format.nestLike('MercoraAPI', {
    colors: !isServerless && !isProduction,
    prettyPrint: !isProduction,
  }),
);

const transportsList: any[] = [
  new transports.Console({
    level: resolvedLevel,
    silent: isTest && process.env.LOG_IN_TESTS !== 'true',
    format: isProduction ? prodJsonFormat : devConsoleFormat,
  }),
];

// In non-serverless environments (local dev / Docker / VM), add daily rotated logs
if (!isServerless && !isTest) {
  try {
    const logsDirectory = join(process.cwd(), 'logs');
    if (!existsSync(logsDirectory)) {
      mkdirSync(logsDirectory, { recursive: true });
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const DailyRotateFile = require('winston-daily-rotate-file');

    const fileFormat = isProduction
      ? prodJsonFormat
      : format.combine(
          timestampFormat,
          format.errors({ stack: true }),
          nestWinstonModuleUtilities.format.nestLike('MercoraAPI', {
            colors: false,
            prettyPrint: false,
          }),
        );

    const filterByLevel = (level: string) =>
      format((info) => (info.level === level ? info : false))();

    const filterPayments = format((info) => {
      const ctx = String(info.context || '');
      const msg = String(info.message || '');
      if (
        ctx.includes('Payment') ||
        ctx.includes('Razorpay') ||
        ctx.includes('Subscription') ||
        ctx.includes('Webhook') ||
        ctx.includes('Invoice') ||
        ctx.includes('Refund') ||
        msg.includes('PAYMENT')
      ) {
        return info;
      }
      return false;
    })();

    const rotateTransportOptions = {
      dirname: logsDirectory,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
    };

    transportsList.push(
      new DailyRotateFile({
        ...rotateTransportOptions,
        filename: 'combined-%DATE%.log',
        level: resolvedLevel,
        format: fileFormat,
      }),
      new DailyRotateFile({
        ...rotateTransportOptions,
        filename: 'error-%DATE%.log',
        level: 'error',
        format: format.combine(filterByLevel('error'), fileFormat),
      }),
      new DailyRotateFile({
        ...rotateTransportOptions,
        filename: 'payments-%DATE%.log',
        level: 'info',
        maxFiles: '90d',
        format: format.combine(filterPayments, prodJsonFormat),
      }),
    );
  } catch {
    // Fallback gracefully to console logging only
  }
}

export const loggerConfig: WinstonModuleOptions = {
  level: resolvedLevel,
  format: isProduction ? prodJsonFormat : devConsoleFormat,
  transports: transportsList,
};
