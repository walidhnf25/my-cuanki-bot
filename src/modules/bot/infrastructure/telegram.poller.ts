import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramGateway } from './telegram.gateway';

const POLL_TIMEOUT_SECONDS = 25;
const ERROR_BACKOFF_MS = 5_000;

/**
 * Local-development alternative to the webhook: long-polls getUpdates when
 * TELEGRAM_POLLING=true, so the bot runs without a public URL. Never enable it
 * on Vercel — serverless functions don't stay alive to poll.
 */
@Injectable()
export class TelegramPoller implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramPoller.name);
  private readonly enabled: boolean;
  private stopped = false;

  constructor(
    private readonly gateway: TelegramGateway,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('telegram.polling', false);
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    this.logger.log('TELEGRAM_POLLING=true — polling Telegram for updates');
    void this.loop();
  }

  onModuleDestroy(): void {
    this.stopped = true;
  }

  private async loop(): Promise<void> {
    let offset = 0;
    while (!this.stopped) {
      try {
        const updates = await this.gateway.getUpdates(offset, POLL_TIMEOUT_SECONDS);
        for (const update of updates) {
          offset = update.update_id + 1;
          try {
            await this.gateway.handleUpdate(update);
          } catch (err) {
            this.logger.error({ err, updateId: update.update_id }, 'Failed to handle update');
          }
        }
      } catch (err) {
        // A 409 here means a webhook is set — remove it with deleteWebhook first.
        this.logger.error({ err }, 'getUpdates failed; retrying shortly');
        await new Promise((resolve) => setTimeout(resolve, ERROR_BACKOFF_MS));
      }
    }
  }
}
