import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
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
    categoryId: int("category_id"),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    contentMd: text("content_md").notNull(),
    summary: varchar("summary", { length: 200 }),
    description: varchar("description", { length: 300 }),
    thumbnailUrl: varchar("thumbnail_url", { length: 500 }),
    visibility: mysqlEnum("visibility", ["public", "private"])
      .default("public")
      .notNull(),
    searchIndexable: boolean("search_indexable").default(true).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"])
      .default("draft")
      .notNull(),
    commentStatus: mysqlEnum("comment_status", ["open", "locked", "disabled"])
      .default("open")
      .notNull(),
    isPinned: boolean("is_pinned").default(false).notNull(),
    publishedAt: timestamp("published_at"),
    contentModifiedAt: timestamp("content_modified_at"),
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
