import {
  mysqlTable,
  int,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * Stats Daily Table - 일별 통계 (포스트별 또는 전체)
 * postId=0은 사이트 전체 센티넬 값. NULL 삽입 금지.
 * (MySQL unique index에서 NULL≠NULL이므로 ON DUPLICATE KEY UPDATE가 동작하지 않음)
 */
export const statsDailyTable = mysqlTable(
  "stats_daily_tb",
  {
    id: int("id").primaryKey().autoincrement(),
    postId: int("post_id").notNull(), // 0 = 사이트 전체 센티넬; NULL 사용 금지
    date: date("date").notNull(),
    pageviews: int("pageviews").default(0).notNull(),
    uniques: int("uniques").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    postDateIdx: uniqueIndex("post_date_idx").on(table.postId, table.date),
  }),
);

/**
 * Types
 */
export type StatsDaily = typeof statsDailyTable.$inferSelect;
export type NewStatsDaily = typeof statsDailyTable.$inferInsert;
