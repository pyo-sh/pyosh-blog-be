import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/mysql-core";

/**
 * Category Table - 계층 구조 카테고리 (메뉴 기능 통합)
 * parent_id를 통해 계층 구조 구현 (최상위는 NULL)
 */
export const categoryTable = mysqlTable(
  "category_tb",
  {
    id: int("id").primaryKey().autoincrement(),
    parentId: int("parent_id"), // Self FK - 상위 카테고리 참조
    name: varchar("name", { length: 50 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    sortOrder: int("sort_order").default(0).notNull(),
    isVisible: boolean("is_visible").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    parentIdIdx: index("parent_id_idx").on(table.parentId),
    sortOrderIdx: index("sort_order_idx").on(table.sortOrder),
  }),
);

/**
 * Types
 */
export type Category = typeof categoryTable.$inferSelect;
export type NewCategory = typeof categoryTable.$inferInsert;
