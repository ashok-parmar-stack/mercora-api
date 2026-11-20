import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import { format, transports } from 'winston';
import type { WinstonModuleOptions } from 'nest-winston';

const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NOW_REGION
);

const timestampFormat = format.timestamp({
  format: 'YYYY-MM-DD HH:mm:ss',
});

const consoleFormat = format.combine(
  timestampFormat,
  format.errors({ stack: true }),
  nestWinstonModuleUtilities.format.nestLike('MercoraAPI', {
    colors: !isServerless,
    prettyPrint: true,
  }),
);

const transportsList: any[] = [
  new transports.Console({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: consoleFormat,
  }),
];

// In non-serverless environments (local dev / Docker), optionally add file rotation
if (!isServerless) {
  try {
    const logsDirectory = join(process.cwd(), 'logs');
    if (!existsSync(logsDirectory)) {
      mkdirSync(logsDirectory, { recursive: true });
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const DailyRotateFile = require('winston-daily-rotate-file');
    const nestLikeFormat = nestWinstonModuleUtilities.format.nestLike('MercoraAPI', {
      colors: false,
      prettyPrint: false,
    });

    const fileFormat = format.combine(
      timestampFormat,
      format.errors({ stack: true }),
      nestLikeFormat,
    );

    const filterByLevel = (level: string) =>
      format((info) => (info.level === level ? info : false))();

    const rotateTransportOptions = {
      dirname: logsDirectory,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    };

    transportsList.push(
      new DailyRotateFile({
        ...rotateTransportOptions,
        filename: 'combined-%DATE%.log',
        level: 'debug',
        format: fileFormat,
      }),
      new DailyRotateFile({
        ...rotateTransportOptions,
        filename: 'error-%DATE%.log',
        level: 'error',
        format: format.combine(filterByLevel('error'), fileFormat),
      }),
    );
  } catch {
    // Fallback gracefully to console logging only
  }
}

export const loggerConfig: WinstonModuleOptions = {
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: consoleFormat,
  transports: transportsList,
};

