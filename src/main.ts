import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use Pino as the app-wide logger.
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  const isProduction = config.get<boolean>('app.isProduction', false);

  // Global input validation (DTOs). Global exception filter is added in Phase 3.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  // Swagger / OpenAPI
  if (config.get<boolean>('swagger.enabled', true)) {
    const swaggerPath = config.get<string>('swagger.path', 'docs');
    const swaggerConfig = new DocumentBuilder()
      .setTitle('finance-whatsapp-bot API')
      .setDescription('WhatsApp finance-tracking chatbot — admin & ops API')
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document);
  }

  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`🚀 Application listening on port ${port} (production=${isProduction})`);
}

void bootstrap();
