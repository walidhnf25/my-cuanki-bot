import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export enum ParserDriver {
  Rule = 'rule',
  OpenAI = 'openai',
  Gemini = 'gemini',
  Ollama = 'ollama',
}

/**
 * Strongly-typed, validated representation of the process environment.
 * Boot fails fast (before Nest starts) if anything is missing/invalid.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  APP_NAME = 'finance-whatsapp-bot';

  @IsString()
  @IsOptional()
  TZ = 'Asia/Jakarta';

  @IsString()
  @IsNotEmpty()
  LOG_LEVEL = 'info';

  @IsBoolean()
  LOG_PRETTY = false;

  @IsString()
  @IsNotEmpty()
  GOOGLE_SHEETS_SPREADSHEET_ID!: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_SERVICE_ACCOUNT_EMAIL!: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_PRIVATE_KEY!: string;

  @IsEnum(ParserDriver)
  PARSER_DRIVER: ParserDriver = ParserDriver.Rule;

  @IsString()
  @IsNotEmpty()
  TELEGRAM_BOT_TOKEN!: string;

  @IsString()
  @IsOptional()
  TELEGRAM_WEBHOOK_SECRET?: string;

  @IsBoolean()
  TELEGRAM_POLLING = false;

  @IsString()
  @IsOptional()
  TELEGRAM_ALLOWED_USER_IDS?: string;

  @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsString()
  @IsNotEmpty()
  SWAGGER_PATH = 'docs';
}

/**
 * Coerces raw string env values (everything from process.env is a string)
 * into the correct primitive types before validation. Unset variables are
 * left out entirely so the class defaults apply.
 */
function coerce(config: Record<string, unknown>): Record<string, unknown> {
  const toBool = (v: string): boolean => v.toLowerCase() === 'true' || v === '1';
  const toInt = (v: string): number | string => (v.trim() !== '' ? Number(v) : v);
  const converters: Record<string, (v: string) => unknown> = {
    PORT: toInt,
    LOG_PRETTY: toBool,
    TELEGRAM_POLLING: toBool,
    SWAGGER_ENABLED: toBool,
  };

  const result: Record<string, unknown> = { ...config };
  for (const [key, convert] of Object.entries(converters)) {
    const value = config[key];
    if (typeof value === 'string') result[key] = convert(value);
  }
  return result;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, coerce(config), {
    enableImplicitConversion: false,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const message = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`❌ Invalid environment configuration:\n${message}`);
  }

  return validatedConfig;
}
