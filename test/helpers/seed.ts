import { eq, sql } from "drizzle-orm";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "./app";
import { db } from "@src/db/client";
import {
  adminTable,
  categoryTable,
  NewCategory,
  NewPost,
  NewTag,
  postTable,
  tagTable,
} from "@src/db/schema";
import { hashPassword } from "@src/shared/password";

/** 테스트 실행 순서대로 TRUNCATE할 테이블 목록 (FK 의존성 역순) */
const ALL_TABLES = [
  "post_tag_tb",
  "comment_tb",
  "guestbook_entry_tb",
  "stats_daily_tb",
  "post_tb",
  "asset_tb",
  "tag_tb",
  "category_tb",
  "oauth_account_tb",
  "admin_tb",
  "session_tb",
  "user_tb",
  "image_tb",
] as const;

/**
 * 모든 테이블 데이터 초기화 (각 테스트 전 격리용)
 */
export async function truncateAll(): Promise<void> {
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);
  for (const table of ALL_TABLES) {
    await db.execute(sql.raw(`TRUNCATE TABLE \`${table}\``));
  }
  await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);
}

/**
 * 테스트 Admin 계정 생성
 */
export async function seedAdmin(overrides?: {
  email?: string;
  password?: string;
}): Promise<{ id: number; email: string }> {
  const email = overrides?.email ?? TEST_ADMIN_EMAIL;
  const password = overrides?.password ?? TEST_ADMIN_PASSWORD;
  const passwordHash = await hashPassword(password);

  const [result] = await db.insert(adminTable).values({ email, passwordHash });

  return { id: Number(result.insertId), email };
}

/**
 * 테스트 Category 생성
 */
export async function seedCategory(
  overrides?: Partial<NewCategory>,
): Promise<typeof categoryTable.$inferSelect> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const values: NewCategory = {
    name: "Test Category",
    slug: `test-category-${suffix}`,
    sortOrder: 0,
    isVisible: true,
    parentId: null,
    ...overrides,
  };

  const [result] = await db.insert(categoryTable).values(values);
  const [category] = await db
    .select()
    .from(categoryTable)
    .where(eq(categoryTable.id, Number(result.insertId)));

  return category!;
}

/**
 * 테스트 Tag 생성
 */
export async function seedTag(
  overrides?: Partial<NewTag>,
): Promise<typeof tagTable.$inferSelect> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const values: NewTag = {
    name: `test-tag-${suffix}`,
    slug: `test-tag-${suffix}`,
    ...overrides,
  };

  const [result] = await db.insert(tagTable).values(values);
  const [tag] = await db
    .select()
    .from(tagTable)
    .where(eq(tagTable.id, Number(result.insertId)));

  return tag!;
}

/**
 * 테스트 Post 생성
 */
export async function seedPost(
  categoryId: number,
  overrides?: Partial<NewPost>,
): Promise<typeof postTable.$inferSelect> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const values: NewPost = {
    categoryId,
    title: "Test Post",
    slug: `test-post-${suffix}`,
    contentMd: "# Test Post\n\nThis is a test post.",
    visibility: "public",
    status: "published",
    publishedAt: new Date(),
    ...overrides,
  };

  const [result] = await db.insert(postTable).values(values);
  const [post] = await db
    .select()
    .from(postTable)
    .where(eq(postTable.id, Number(result.insertId)));

  return post!;
}
