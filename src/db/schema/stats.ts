import {
  mysqlTable,
  int,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * Stats Daily Table - 일별 통계 (포스트별 또는 전체)
 * post_id가 NULL이면 전체 사이트 통계
 */
export const statsDailyTable = mysqlTable(
  "stats_daily_tb",
  {
    id: int("id").primaryKey().autoincrement(),
    postId: int("post_id"), // NULL이면 전체 사이트 통계
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
