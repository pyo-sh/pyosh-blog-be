import { mysqlTable, int, varchar, timestamp } from "drizzle-orm/mysql-core";

/**
 * Asset Table - 이미지/파일 자산
 * 기존 imageTable을 대체하는 확장된 자산 관리 테이블
 */
export const assetTable = mysqlTable("asset_tb", {
  id: int("id").primaryKey().autoincrement(),
  storageProvider: varchar("storage_provider", { length: 20 })
    .default("local")
    .notNull(),
  storageKey: varchar("storage_key", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  sizeBytes: int("size_bytes").notNull(),
  width: int("width"),
  height: int("height"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Types
 */
export type Asset = typeof assetTable.$inferSelect;
export type NewAsset = typeof assetTable.$inferInsert;
