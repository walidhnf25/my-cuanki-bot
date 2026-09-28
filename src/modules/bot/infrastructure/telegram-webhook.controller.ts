import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { TelegramGateway } from './telegram.gateway';
import { TelegramUpdate } from './telegram.types';

/**
 * Receives Telegram webhook updates. Processing is awaited before responding
 * because a serverless function is frozen once the response is sent. Failures
 * are logged and still answered with 200 — otherwise Telegram keeps retrying
 * the same update.
 */
@ApiExcludeController()
@Controller('telegram')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);
  private readonly secret: string;

  constructor(
    private readonly gateway: TelegramGateway,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('telegram.webhookSecret', '');
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') secretHeader?: string,
  ): Promise<{ ok: true }> {
    if (this.secret && !this.matchesSecret(secretHeader)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    try {
      await this.gateway.handleUpdate(update);
    } catch (err) {
      this.logger.error({ err, updateId: update?.update_id }, 'Failed to handle Telegram update');
    }
    return { ok: true };
  }

  private matchesSecret(header: string | undefined): boolean {
    const expected = Buffer.from(this.secret);
    const actual = Buffer.from(header ?? '');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
