export type WorkItemListResponse = {
  items: unknown[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
};
