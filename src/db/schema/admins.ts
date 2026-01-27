import { mysqlTable, int, varchar, timestamp } from "drizzle-orm/mysql-core";

/**
 * Admin Table - 관리자 계정 (로컬 인증)
 */
export const adminTable = mysqlTable("admin_tb", {
  id: int("id").primaryKey().autoincrement(),
  email: varchar("email", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

/**
 * Types
 */
export type Admin = typeof adminTable.$inferSelect;
export type NewAdmin = typeof adminTable.$inferInsert;
