import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  mysqlEnum,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * OAuth Account Table - OAuth 제공자별 계정
 */
export const oauthAccountTable = mysqlTable(
  "oauth_account_tb",
  {
    id: int("id").primaryKey().autoincrement(),
    provider: mysqlEnum("provider", ["github", "google"]).notNull(),
    providerUserId: varchar("provider_user_id", { length: 100 }).notNull(),
    email: varchar("email", { length: 100 }),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    avatarUrl: varchar("avatar_url", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    providerUserIdx: uniqueIndex("provider_user_idx").on(
      table.provider,
      table.providerUserId,
    ),
  }),
);

/**
 * Types
 */
export type OAuthAccount = typeof oauthAccountTable.$inferSelect;
export type NewOAuthAccount = typeof oauthAccountTable.$inferInsert;
