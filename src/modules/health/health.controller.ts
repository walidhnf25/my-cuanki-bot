import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WhatsappHealthIndicator } from '../whatsapp/health/whatsapp.health-indicator';
import { PrismaHealthIndicator } from './indicators/prisma.health-indicator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly whatsapp: WhatsappHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness & readiness probe (db, memory, whatsapp)' })
  check() {
    return this.health.check([
      () => this.prisma.isHealthy('database'),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.whatsapp.isHealthy('whatsapp'),
    ]);
  }
}
