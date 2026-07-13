import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { WhatsappHealthIndicator } from '../whatsapp/health/whatsapp.health-indicator';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './indicators/prisma.health-indicator';

@Module({
  imports: [TerminusModule, WhatsappModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, WhatsappHealthIndicator],
})
export class HealthModule {}
