import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

/** Long-running local server. On Vercel, serverless.ts is the entry point instead. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app, { swagger: true });
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  const isProduction = config.get<boolean>('app.isProduction', false);

  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`🚀 Application listening on port ${port} (production=${isProduction})`);
}

void bootstrap();
