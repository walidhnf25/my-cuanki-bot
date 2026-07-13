import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { SYSTEM_CATEGORIES } from './seed-data';

/**
 * Ensures the system categories + keyword mappings exist on every boot
 * (idempotent). This makes automatic categorization work out-of-the-box in any
 * environment without a separate manual seed step. Failures are logged, never
 * fatal to startup.
 */
@Injectable()
export class CategorySeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CategorySeederService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      let categories = 0;
      let keywords = 0;

      for (const cat of SYSTEM_CATEGORIES) {
        const existing = await this.prisma.category.findFirst({
          where: { userId: null, name: cat.name, type: cat.type },
        });
        const category =
          existing ??
          (await this.prisma.category.create({
            data: {
              userId: null,
              name: cat.name,
              type: cat.type,
              icon: cat.icon,
              isSystem: true,
            },
          }));
        categories += 1;

        for (const keyword of cat.keywords) {
          await this.prisma.categoryKeyword.upsert({
            where: { categoryId_keyword: { categoryId: category.id, keyword } },
            create: { categoryId: category.id, keyword },
            update: {},
          });
          keywords += 1;
        }
      }

      this.logger.log(`System categories ensured (${categories} categories, ${keywords} keywords)`);
    } catch (err) {
      this.logger.error({ err }, 'Category seeding failed (non-fatal)');
    }
  }
}
