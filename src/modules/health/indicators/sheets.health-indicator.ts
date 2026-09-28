import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { SheetsClient } from 'src/sheets/sheets.client';

/**
 * Custom Terminus indicator that verifies the spreadsheet is reachable with
 * the configured service account (one lightweight metadata read).
 */
@Injectable()
export class SheetsHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly sheets: SheetsClient,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.sheets.ping();
      return indicator.up();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return indicator.down({ message });
    }
  }
}
