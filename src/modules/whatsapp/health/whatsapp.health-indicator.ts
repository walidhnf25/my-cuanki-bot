import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { MessagingGateway } from '../domain/messaging.gateway.port';

/**
 * Reports WhatsApp connection status. Deliberately always "up" (with a
 * `connected` detail) so a transient WA disconnect does not fail the overall
 * liveness probe — monitoring reads the detail instead.
 */
@Injectable()
export class WhatsappHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly gateway: MessagingGateway,
  ) {}

  isHealthy(key: string): HealthIndicatorResult {
    return this.healthIndicatorService.check(key).up({
      connected: this.gateway.isConnected(),
      state: this.gateway.getStatus(),
    });
  }
}
