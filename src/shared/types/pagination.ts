/** Standard pagination request parameters. */
export interface PageParams {
  page: number;
  pageSize: number;
}

/** Standard paginated result envelope used by repositories/services. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function buildPaginated<T>(
  items: T[],
  total: number,
  { page, pageSize }: PageParams,
): Paginated<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
