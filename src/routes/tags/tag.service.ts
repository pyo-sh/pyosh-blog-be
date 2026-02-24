import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import { z } from "zod";
import * as schema from "@src/db/schema/index";
import { postTagTable } from "@src/db/schema/post-tags";
import { postTable } from "@src/db/schema/posts";
import { Tag, tagTable, NewTag } from "@src/db/schema/tags";
import { generateSlug } from "@src/shared/slug";
import { TagWithPostCountSchema } from "./tag.schema";

/**
 * Tag Service
 */
export type PublicTagWithCount = z.infer<typeof TagWithPostCountSchema>;

export class TagService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * 태그 이름 정규화
   * - trim + lowercase
   * - 빈 문자열 제거
   * - 중복 제거
   */
  private normalizeTagNames(names: string[]): string[] {
    const normalized = names
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name.length > 0);

    return [...new Set(normalized)];
  }

  /**
   * 태그 이름으로 조회 또는 생성
   * - 기존 태그는 재사용
   * - 새 태그는 자동 생성
   * - Phase 5 Posts 모듈에서 사용
   */
  async getOrCreateTags(names: string[]): Promise<number[]> {
    if (names.length === 0) {
      return [];
    }

    // 1. 입력된 이름 배열 정규화 (trim, lowercase, dedupe)
    const normalizedNames = this.normalizeTagNames(names);
    if (normalizedNames.length === 0) {
      return [];
    }

    // 2. 기존 태그 조회
    const existingTags = await this.db
      .select()
      .from(tagTable)
      .where(inArray(tagTable.name, normalizedNames));

    // 3. 존재하지 않는 이름들 추출
    const existingNames = new Set(existingTags.map((tag) => tag.name));
    const newNames = normalizedNames.filter((name) => !existingNames.has(name));

    // 4. 새 태그 일괄 생성
    if (newNames.length > 0) {
      const newTags: NewTag[] = newNames.map((name) => ({
        name,
        slug: generateSlug(name),
      }));

      await this.db.insert(tagTable).values(newTags);

      // 새로 생성된 태그 조회
      const createdTags = await this.db
        .select()
        .from(tagTable)
        .where(inArray(tagTable.name, newNames));

      // 5. 전체 태그 ID 배열 반환
      return [...existingTags, ...createdTags].map((tag) => tag.id);
    }

    // 기존 태그만 반환
    return existingTags.map((tag) => tag.id);
  }

  /**
   * 공개 태그 목록 조회
   * - 공개(public) + 발행(published) + 미삭제 게시글 기준 집계
   * - postCount 내림차순, 이름 오름차순 정렬
   */
  async getPublicTagsWithCount(): Promise<PublicTagWithCount[]> {
    const postCountExpr = sql<number>`COUNT(${postTagTable.postId})`;

    const rows = await this.db
      .select({
        id: tagTable.id,
        name: tagTable.name,
        slug: tagTable.slug,
        postCount: postCountExpr,
      })
      .from(tagTable)
      .innerJoin(postTagTable, eq(tagTable.id, postTagTable.tagId))
      .innerJoin(postTable, eq(postTagTable.postId, postTable.id))
      .where(
        and(
          eq(postTable.status, "published"),
          eq(postTable.visibility, "public"),
          isNull(postTable.deletedAt),
        ),
      )
      .groupBy(tagTable.id)
      .orderBy(desc(postCountExpr), asc(tagTable.name));

    return rows.map((row) => ({
      ...row,
      postCount: Number(row.postCount),
    }));
  }

  /**
   * 사용되지 않는 태그 삭제 (관리 편의 기능)
   * - post_tag_tb에 연결되지 않은 태그 삭제
   */
  async deleteUnusedTags(): Promise<number> {
    // post_tag_tb에 연결되지 않은 태그 ID 조회
    const usedTagIds = await this.db
      .selectDistinct({ tagId: postTagTable.tagId })
      .from(postTagTable);

    const usedIds = usedTagIds.map((row) => row.tagId);

    if (usedIds.length === 0) {
      // 모든 태그가 사용되지 않음 - 전체 삭제
      const [result] = await this.db.delete(tagTable);

      return result.affectedRows;
    }

    // 사용되지 않는 태그 삭제
    const [result] = await this.db
      .delete(tagTable)
      .where(notInArray(tagTable.id, usedIds));

    return result.affectedRows;
  }
}
