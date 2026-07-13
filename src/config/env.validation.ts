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
  DATABASE_URL!: string;

  @IsEnum(ParserDriver)
  PARSER_DRIVER: ParserDriver = ParserDriver.Rule;

  @IsString()
  @IsNotEmpty()
  WA_SESSION_PATH = './storage/wa-session';

  @IsBoolean()
  WA_PRINT_QR = true;

  @IsBoolean()
  WA_AUTOSTART = true;

  @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsString()
  @IsNotEmpty()
  SWAGGER_PATH = 'docs';
}

/**
 * Coerces raw string env values (everything from process.env is a string)
 * into the correct primitive types before validation.
 */
function coerce(config: Record<string, unknown>): Record<string, unknown> {
  const toBool = (v: unknown): unknown =>
    typeof v === 'string' ? v.toLowerCase() === 'true' || v === '1' : v;
  const toInt = (v: unknown): unknown => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v);

  return {
    ...config,
    PORT: toInt(config.PORT),
    LOG_PRETTY: toBool(config.LOG_PRETTY),
    WA_PRINT_QR: toBool(config.WA_PRINT_QR),
    WA_AUTOSTART: toBool(config.WA_AUTOSTART),
    SWAGGER_ENABLED: toBool(config.SWAGGER_ENABLED),
  };
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
