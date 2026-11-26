import 'class-validator';
import 'class-transformer';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express, Request, Response } from 'express';
import { WinstonModule } from 'nest-winston';
import { loggerConfig } from '../src/common/logger';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';

const server: Express = express();
let initPromise: Promise<void> | null = null;

server.get(['/', '/api'], (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'Mercora API is running',
    health: '/api/health',
    timestamp: new Date().toISOString(),
  });
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: WinstonModule.createLogger(loggerConfig),
    bufferLogs: true,
  });

  configureApp(app);

  await app.init();
}

export default async function handler(req: Request, res: Response) {
  if (!initPromise) {
    initPromise = bootstrap().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;

  // Vercel CLI 62+ rewrites requests to '/api'. Restore original requested URL
  // so NestJS router matches the intended route (e.g. /api/health, /api/v1/auth)
  const matchedPath = req.headers['x-matched-path'] as string | undefined;
  const original = matchedPath || req.originalUrl;
  if (original && (req.url === '/api' || req.url === '/api/') && original !== '/api' && original !== '/') {
    req.url = original;
  }

  server(req, res);
}
