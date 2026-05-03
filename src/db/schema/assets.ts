import {
  boolean,
  index,
  int,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Asset Category Table - 에셋 관리/필터링용 flat 카테고리
 */
export const assetCategoryTable = mysqlTable(
  "asset_category_tb",
  {
    id: int("id").primaryKey().autoincrement(),
    key: varchar("key", { length: 50 }),
    name: varchar("name", { length: 50 }).notNull(),
    sortOrder: int("sort_order").default(0).notNull(),
    isProtected: boolean("is_protected").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    keyIdx: uniqueIndex("asset_category_key_idx").on(table.key),
    sortOrderIdx: index("asset_category_sort_order_idx").on(table.sortOrder),
  }),
);

/**
 * Asset Table - 이미지/파일 자산
 * 기존 imageTable을 대체하는 확장된 자산 관리 테이블
 */
export const assetTable = mysqlTable(
  "asset_tb",
  {
    id: int("id").primaryKey().autoincrement(),
    categoryId: int("category_id").notNull(),
    displayName: varchar("display_name", { length: 200 }),
    storageProvider: varchar("storage_provider", { length: 20 })
      .default("local")
      .notNull(),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: int("size_bytes").notNull(),
    width: int("width"),
    height: int("height"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    categoryIdIdx: index("asset_category_id_idx").on(table.categoryId),
    displayNameIdx: index("asset_display_name_idx").on(table.displayName),
  }),
);

/**
 * Types
 */
export type Asset = typeof assetTable.$inferSelect;
export type NewAsset = typeof assetTable.$inferInsert;
export type AssetCategory = typeof assetCategoryTable.$inferSelect;
export type NewAssetCategory = typeof assetCategoryTable.$inferInsert;
