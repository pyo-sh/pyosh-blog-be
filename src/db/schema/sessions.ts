import { mysqlTable, int, varchar } from "drizzle-orm/mysql-core";

/**
 * Session Table
 */
export const sessionTable = mysqlTable("session_tb", {
  id: varchar("id", { length: 128 }).primaryKey(),
  expiresAt: int("expires_at").notNull(),
  data: varchar("data", { length: 2048 }).notNull(),
});

/**
 * Types
 */
export type Session = typeof sessionTable.$inferSelect;
export type NewSession = typeof sessionTable.$inferInsert;
