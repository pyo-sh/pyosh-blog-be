import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";

/**
 * Post Table - 블로그 포스트
 */
export const postTable = mysqlTable(
  "post_tb",
  {
    id: int("id").primaryKey().autoincrement(),
    categoryId: int("category_id").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    contentMd: text("content_md").notNull(),
    thumbnailAssetId: int("thumbnail_asset_id"),
    visibility: mysqlEnum("visibility", ["public", "private"])
      .default("public")
      .notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"])
      .default("draft")
      .notNull(),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    categoryPublishedIdx: index("category_published_idx").on(
      table.categoryId,
      table.publishedAt,
    ),
    statusPublishedIdx: index("status_published_idx").on(
      table.status,
      table.publishedAt,
    ),
  }),
);

/**
 * Types
 */
export type Post = typeof postTable.$inferSelect;
export type NewPost = typeof postTable.$inferInsert;
