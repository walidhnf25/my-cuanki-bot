import { TransactionType } from 'src/shared/domain/enums';
import { CategoryEntity, CreateCategoryInput, FindByKeywordOptions } from './category.entity';

export abstract class CategoryRepository {
  abstract findById(id: string): Promise<CategoryEntity | null>;

  /** Resolve a category from a keyword (automatic categorization). */
  abstract findByKeyword(
    keyword: string,
    options?: FindByKeywordOptions,
  ): Promise<CategoryEntity | null>;

  abstract findByNameAndType(
    name: string,
    type: TransactionType,
    userId?: string | null,
  ): Promise<CategoryEntity | null>;

  /** System categories + the given user's custom categories. */
  abstract findAllForUser(userId: string): Promise<CategoryEntity[]>;

  abstract findSystem(): Promise<CategoryEntity[]>;

  abstract create(input: CreateCategoryInput): Promise<CategoryEntity>;
}
