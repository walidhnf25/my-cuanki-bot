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

export interface SheetsConfig {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
}

export interface ParserConfig {
  driver: string;
}

export interface TelegramConfig {
  botToken: string;
  /** Expected `X-Telegram-Bot-Api-Secret-Token` header on webhook calls. */
  webhookSecret: string;
  /** Long-poll getUpdates instead of the webhook (local development). */
  polling: boolean;
  /** Telegram user ids allowed to use the bot; empty = everyone. */
  allowedUserIds: string[];
}

export interface SwaggerConfig {
  enabled: boolean;
  path: string;
}

export interface Configuration {
  app: AppConfig;
  log: LogConfig;
  sheets: SheetsConfig;
  parser: ParserConfig;
  telegram: TelegramConfig;
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
    sheets: {
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? '',
      clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '',
      // Env files and dashboards often store the PEM with literal "\n".
      privateKey: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\n/g, '\n'),
    },
    parser: {
      driver: process.env.PARSER_DRIVER ?? 'rule',
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
      polling: (process.env.TELEGRAM_POLLING ?? 'false').toLowerCase() === 'true',
      allowedUserIds: (process.env.TELEGRAM_ALLOWED_USER_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    },
    swagger: {
      enabled: (process.env.SWAGGER_ENABLED ?? 'true').toLowerCase() === 'true',
      path: process.env.SWAGGER_PATH ?? 'docs',
    },
  };
};
