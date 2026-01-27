import { mysqlTable, int, primaryKey, index } from "drizzle-orm/mysql-core";

/**
 * PostTag Table - 포스트-태그 다대다 관계
 */
export const postTagTable = mysqlTable(
  "post_tag_tb",
  {
    postId: int("post_id").notNull(),
    tagId: int("tag_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.tagId] }),
    tagIdx: index("tag_id_idx").on(table.tagId),
  }),
);

/**
 * Types
 */
export type PostTag = typeof postTagTable.$inferSelect;
export type NewPostTag = typeof postTagTable.$inferInsert;
