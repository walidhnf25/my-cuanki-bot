/**
 * Namespaced, typed configuration derived from validated env vars.
 * Consumers inject ConfigService and read via these keys, e.g.
 *   configService.get('app.port', { infer: true })
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  name: string;
  timezone: string;
  isProduction: boolean;
}

export interface LogConfig {
  level: string;
  pretty: boolean;
}

export interface DatabaseConfig {
  url: string;
}

export interface ParserConfig {
  driver: string;
}

export interface WhatsappConfig {
  sessionPath: string;
  printQr: boolean;
  /** Auto-connect to WhatsApp on boot. Disable in tests/CI. */
  autostart: boolean;
}

export interface SwaggerConfig {
  enabled: boolean;
  path: string;
}

export interface Configuration {
  app: AppConfig;
  log: LogConfig;
  database: DatabaseConfig;
  parser: ParserConfig;
  whatsapp: WhatsappConfig;
  swagger: SwaggerConfig;
}

export default (): Configuration => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return {
    app: {
      nodeEnv,
      port: parseInt(process.env.PORT ?? '3000', 10),
      name: process.env.APP_NAME ?? 'finance-whatsapp-bot',
      timezone: process.env.TZ ?? 'Asia/Jakarta',
      isProduction: nodeEnv === 'production',
    },
    log: {
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: (process.env.LOG_PRETTY ?? 'false').toLowerCase() === 'true',
    },
    database: {
      url: process.env.DATABASE_URL ?? '',
    },
    parser: {
      driver: process.env.PARSER_DRIVER ?? 'rule',
    },
    whatsapp: {
      sessionPath: process.env.WA_SESSION_PATH ?? './storage/wa-session',
      printQr: (process.env.WA_PRINT_QR ?? 'true').toLowerCase() === 'true',
      autostart: (process.env.WA_AUTOSTART ?? 'true').toLowerCase() === 'true',
    },
    swagger: {
      enabled: (process.env.SWAGGER_ENABLED ?? 'true').toLowerCase() === 'true',
      path: process.env.SWAGGER_PATH ?? 'docs',
    },
  };
};
