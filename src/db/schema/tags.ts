import { mysqlTable, int, varchar, timestamp } from "drizzle-orm/mysql-core";

/**
 * Tag Table - 태그
 */
export const tagTable = mysqlTable("tag_tb", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 30 }).notNull().unique(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Types
 */
export type Tag = typeof tagTable.$inferSelect;
export type NewTag = typeof tagTable.$inferInsert;
