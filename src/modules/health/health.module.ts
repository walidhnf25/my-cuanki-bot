import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { SheetsHealthIndicator } from './indicators/sheets.health-indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [SheetsHealthIndicator],
})
export class HealthModule {}
