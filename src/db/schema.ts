import { relations } from "drizzle-orm";
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/mysql-core";

/**
 * User Table
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
 * Image Table
 */
export const imageTable = mysqlTable("image_tb", {
  id: int("id").primaryKey().autoincrement(),
  url: varchar("url", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

/**
 * Session Table
 */
export const sessionTable = mysqlTable("session_tb", {
  id: varchar("id", { length: 128 }).primaryKey(),
  expiresAt: int("expires_at").notNull(),
  data: varchar("data", { length: 2048 }).notNull(),
});

/**
 * Relations
 */
export const userRelations = relations(userTable, ({ one }) => ({
  image: one(imageTable, {
    fields: [userTable.imageId],
    references: [imageTable.id],
  }),
}));

export const imageRelations = relations(imageTable, ({ many }) => ({
  users: many(userTable),
}));

/**
 * Types
 */
export type User = typeof userTable.$inferSelect;
export type NewUser = typeof userTable.$inferInsert;

export type Image = typeof imageTable.$inferSelect;
export type NewImage = typeof imageTable.$inferInsert;

export type Session = typeof sessionTable.$inferSelect;
export type NewSession = typeof sessionTable.$inferInsert;
