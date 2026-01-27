import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/mysql-core";

/**
 * User Table (Legacy - Phase 2에서 admins + oauth_accounts로 교체 예정)
 */
export const userTable = mysqlTable("user_tb", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 20 }).notNull(),
  githubId: varchar("github_id", { length: 50 }),
  googleEmail: varchar("google_email", { length: 50 }),
  writable: boolean("writable").default(false).notNull(),
  imageId: int("image_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

/**
 * Types
 */
export type User = typeof userTable.$inferSelect;
export type NewUser = typeof userTable.$inferInsert;
