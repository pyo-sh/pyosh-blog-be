import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";

/**
 * Guestbook Entry Table - 방명록 엔트리
 * 2단계 구조: parent_id로 답글 구현
 * 작성자: OAuth 계정 또는 게스트
 */
export const guestbookEntryTable = mysqlTable(
  "guestbook_entry_tb",
  {
    id: int("id").primaryKey().autoincrement(),
    parentId: int("parent_id"), // 부모 엔트리 (답글이면 부모 ID, 최상위면 NULL)

    // 작성자 정보
    authorType: mysqlEnum("author_type", ["oauth", "guest"]).notNull(),
    oauthAccountId: int("oauth_account_id"), // OAuth 사용자 ID (authorType='oauth'일 때)

    // 게스트 정보 (authorType='guest'일 때)
    guestName: varchar("guest_name", { length: 50 }),
    guestEmail: varchar("guest_email", { length: 100 }),
    guestPasswordHash: varchar("guest_password_hash", { length: 255 }),

    // 내용
    body: text("body").notNull(),
    isSecret: boolean("is_secret").default(false).notNull(),

    // 상태
    status: mysqlEnum("status", ["active", "deleted", "hidden"])
      .default("active")
      .notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    parentIdIdx: index("parent_id_idx").on(table.parentId),
    oauthAccountIdx: index("oauth_account_idx").on(table.oauthAccountId),
    statusIdx: index("status_idx").on(table.status),
  }),
);

/**
 * Types
 */
export type GuestbookEntry = typeof guestbookEntryTable.$inferSelect;
export type NewGuestbookEntry = typeof guestbookEntryTable.$inferInsert;
