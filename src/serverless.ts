import { NestFactory } from '@nestjs/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;

let server: Promise<RequestListener> | null = null;

async function bootstrap(): Promise<RequestListener> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Swagger UI serves static assets that aren't bundled into the function.
  configureApp(app, { swagger: false });
  await app.init();
  return app.getHttpAdapter().getInstance() as RequestListener;
}

/**
 * Vercel function handler (see api/index.js). The Nest app is created once per
 * warm instance and reused across invocations; a failed boot is retried on
 * the next request instead of being cached.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  server ??= bootstrap().catch((err: unknown) => {
    server = null;
    throw err;
  });
  const listener = await server;
  // Resolve only once Express has finished responding.
  await new Promise<void>((resolve) => {
    res.once('finish', resolve);
    res.once('close', resolve);
    listener(req, res);
  });
}
