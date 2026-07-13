import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from 'src/database/prisma.service';

/**
 * Custom Terminus indicator that verifies database connectivity
 * by issuing a trivial `SELECT 1` through Prisma.
 */
@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.prisma.ping();
      return indicator.up();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      return indicator.down({ message });
    }
  }
}
