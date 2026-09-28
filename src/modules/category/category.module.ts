import { Module } from '@nestjs/common';
import { CategoryResolver } from './application/category-resolver.service';
import { CategorySeederService } from './category-seeder.service';
import { CategoryRepository } from './domain/category.repository';
import { SheetsCategoryRepository } from './infrastructure/sheets-category.repository';

@Module({
  providers: [
    { provide: CategoryRepository, useClass: SheetsCategoryRepository },
    CategoryResolver,
    CategorySeederService,
  ],
  exports: [CategoryRepository, CategoryResolver],
})
export class CategoryModule {}
