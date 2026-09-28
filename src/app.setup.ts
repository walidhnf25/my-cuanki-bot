import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

/** App-wide setup shared by the local server (main.ts) and Vercel (serverless.ts). */
export function configureApp(app: INestApplication, options: { swagger: boolean }): void {
  // Use Pino as the app-wide logger. Flush explicitly: the serverless path
  // never calls listen(), which would otherwise release the buffered logs.
  app.useLogger(app.get(Logger));
  app.flushLogs();

  // Global input validation (DTOs).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = app.get(ConfigService);
  if (options.swagger && config.get<boolean>('swagger.enabled', true)) {
    const swaggerPath = config.get<string>('swagger.path', 'docs');
    const swaggerConfig = new DocumentBuilder()
      .setTitle('finance-whatsapp-bot API')
      .setDescription('Telegram finance-tracking chatbot — admin & ops API')
      .setVersion('0.1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(swaggerPath, app, document);
  }
}
