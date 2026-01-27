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
 * Comment Table - 포스트 댓글
 * 2단계 구조: depth 0(부모) / depth 1(대댓글)
 * 작성자: OAuth 계정 또는 게스트
 */
export const commentTable = mysqlTable(
  "comment_tb",
  {
    id: int("id").primaryKey().autoincrement(),
    postId: int("post_id").notNull(),
    parentId: int("parent_id"), // 부모 댓글 (depth=0이면 NULL, depth=1이면 부모 ID)
    depth: int("depth").default(0).notNull(), // 0 또는 1만 허용
    replyToCommentId: int("reply_to_comment_id"), // 대댓글이 답장하는 댓글 ID
    replyToName: varchar("reply_to_name", { length: 50 }), // 답장 대상 이름 (표시용)

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
    postParentCreatedIdx: index("post_parent_created_idx").on(
      table.postId,
      table.parentId,
      table.createdAt,
    ),
    oauthAccountIdx: index("oauth_account_idx").on(table.oauthAccountId),
    statusIdx: index("status_idx").on(table.status),
  }),
);

/**
 * Types
 */
export type Comment = typeof commentTable.$inferSelect;
export type NewComment = typeof commentTable.$inferInsert;
