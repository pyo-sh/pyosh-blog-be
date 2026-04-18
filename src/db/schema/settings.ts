import { mysqlTable, int, boolean, timestamp } from "drizzle-orm/mysql-core";

/**
 * Site Settings Table - 사이트 설정 (싱글톤)
 * id=1 고정 레코드로 사용
 */
export const siteSettingsTable = mysqlTable("site_settings_tb", {
  id: int("id").primaryKey().autoincrement(),
  guestbookEnabled: boolean("guestbook_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * Types
 */
export type SiteSettings = typeof siteSettingsTable.$inferSelect;
export type NewSiteSettings = typeof siteSettingsTable.$inferInsert;
