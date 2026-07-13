/**
 * Standalone seed for local/dev use: `bun run prisma:seed`.
 * In containers the same data is applied idempotently on boot by
 * CategorySeederService, so this script is optional.
 */
import { PrismaClient, TransactionType } from '@prisma/client';
import { SYSTEM_CATEGORIES } from '../src/modules/category/seed-data';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  let categoryCount = 0;
  let keywordCount = 0;

  for (const cat of SYSTEM_CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { userId: null, name: cat.name, type: cat.type as TransactionType },
    });
    const category =
      existing ??
      (await prisma.category.create({
        data: {
          userId: null,
          name: cat.name,
          type: cat.type as TransactionType,
          icon: cat.icon,
          isSystem: true,
        },
      }));
    categoryCount += 1;

    for (const keyword of cat.keywords) {
      await prisma.categoryKeyword.upsert({
        where: { categoryId_keyword: { categoryId: category.id, keyword } },
        create: { categoryId: category.id, keyword },
        update: {},
      });
      keywordCount += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `🌱 Seed complete: ${categoryCount} system categories, ${keywordCount} keyword mappings.`,
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
