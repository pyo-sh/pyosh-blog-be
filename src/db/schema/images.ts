import { mysqlTable, int, varchar, timestamp } from "drizzle-orm/mysql-core";

/**
 * Image Table (Legacy - Phase 2에서 assets로 교체 예정)
 */
export const imageTable = mysqlTable("image_tb", {
  id: int("id").primaryKey().autoincrement(),
  url: varchar("url", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

/**
 * Types
 */
export type Image = typeof imageTable.$inferSelect;
export type NewImage = typeof imageTable.$inferInsert;
