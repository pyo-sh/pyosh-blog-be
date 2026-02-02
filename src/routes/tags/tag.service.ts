import { eq, like, inArray, sql, notInArray } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "@src/db/schema/index";
import { postTagTable } from "@src/db/schema/post-tags";
import { Tag, tagTable, NewTag } from "@src/db/schema/tags";
import { generateSlug } from "@src/shared/slug";

/**
 * Tag with post count
 */
export interface TagWithCount extends Tag {
  postCount: number;
}

/**
 * Tag Service
 */
export class TagService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * 태그 검색 (자동완성용)
   * - 부분 문자열 검색
   * - 입력하면서 실시간 검색
   */
  async searchTags(keyword: string, limit = 10): Promise<Tag[]> {
    const tags = await this.db
      .select()
      .from(tagTable)
      .where(like(tagTable.name, `%${keyword}%`))
      .limit(limit);

    return tags;
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

    // 1. 입력된 이름 배열 정규화 (trim, lowercase)
    const normalizedNames = names.map((name) => name.trim().toLowerCase());

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
   * 전체 태그 목록 조회
   * - 각 태그에 연결된 게시글 수 포함 (선택)
   */
  async getAllTags(includePostCount = false): Promise<Tag[] | TagWithCount[]> {
    if (!includePostCount) {
      return await this.db.select().from(tagTable);
    }

    // LEFT JOIN으로 각 태그의 게시글 수 포함
    const tagsWithCount = await this.db
      .select({
        id: tagTable.id,
        name: tagTable.name,
        slug: tagTable.slug,
        createdAt: tagTable.createdAt,
        postCount: sql<number>`COALESCE(COUNT(${postTagTable.postId}), 0)`,
      })
      .from(tagTable)
      .leftJoin(postTagTable, eq(tagTable.id, postTagTable.tagId))
      .groupBy(tagTable.id);

    return tagsWithCount;
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
