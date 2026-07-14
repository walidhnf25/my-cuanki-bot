import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';

/**
 * Wipes all data belonging to a single user so they can start over. Removes
 * transactions, budgets, reminders, the conversation context, the user's own
 * custom categories and audit logs — in one transaction. System categories
 * (userId = null) and the user record itself are kept.
 */
@Injectable()
export class ResetUserDataService {
  private readonly logger = new Logger(ResetUserDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reset(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.transaction.deleteMany({ where: { userId } }),
      this.prisma.budget.deleteMany({ where: { userId } }),
      this.prisma.reminder.deleteMany({ where: { userId } }),
      this.prisma.conversationContext.deleteMany({ where: { userId } }),
      this.prisma.category.deleteMany({ where: { userId } }),
      this.prisma.auditLog.deleteMany({ where: { userId } }),
    ]);
    this.logger.log({ userId }, 'User data reset');
  }
}
