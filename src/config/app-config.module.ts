import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { validateEnv } from './env.validation';

/**
 * Global configuration module.
 * - Loads `.env.<NODE_ENV>` then `.env` (later files do NOT override already-set vars).
 *   Inside containers those files are absent, so real process.env (from compose) wins.
 * - Validates the environment at boot (fail-fast).
 * - Exposes namespaced config via `configuration()`.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      load: [configuration],
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
