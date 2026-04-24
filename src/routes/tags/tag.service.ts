import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import { z } from "zod";
import { TagWithPostCountSchema } from "./tag.schema";
import * as schema from "@src/db/schema/index";
import { HttpError } from "@src/errors/http-error";
import { postTagTable } from "@src/db/schema/post-tags";
import { postTable } from "@src/db/schema/posts";
import { Tag, tagTable, NewTag } from "@src/db/schema/tags";
import {
  ensureUniqueSlug,
  generateUnicodeSlug,
  isBlankSlug,
  needsLegacySlugRepair,
} from "@src/shared/slug";

/**
 * Tag Service
 */
export type PublicTagWithCount = z.infer<typeof TagWithPostCountSchema>;

export class TagService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

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

    const repairedExistingTags = await this.repairLegacyTags(existingTags);

    // 3. 존재하지 않는 이름들 추출
    const existingNames = new Set(repairedExistingTags.map((tag) => tag.name));
    const newNames = normalizedNames.filter((name) => !existingNames.has(name));

    // 4. 새 태그 일괄 생성
    if (newNames.length > 0) {
      const createdTags = await Promise.all(
        newNames.map(async (name) => await this.createTag(name)),
      );

      const tagsByName = new Map(
        [...repairedExistingTags, ...createdTags].map((tag) => [tag.name, tag]),
      );

      return normalizedNames.map((name) => tagsByName.get(name)!.id);
    }

    // 기존 태그만 반환
    const tagsByName = new Map(repairedExistingTags.map((tag) => [tag.name, tag]));

    return normalizedNames.map((name) => tagsByName.get(name)!.id);
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
      const [result] = await this.db.delete(tagTable);

      return result.affectedRows;
    }

    // 사용되지 않는 태그 삭제
    const [result] = await this.db
      .delete(tagTable)
      .where(notInArray(tagTable.id, usedIds));

    return result.affectedRows;
  }

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

  private async repairLegacyTags(tags: Tag[]): Promise<Tag[]> {
    const repairedTags: Tag[] = [];

    for (const tag of tags) {
      if (!needsLegacySlugRepair(tag.slug)) {
        repairedTags.push(tag);
        continue;
      }

      repairedTags.push(await this.repairTagSlug(tag.id, tag.name));
    }

    return repairedTags;
  }

  private async createTag(name: string): Promise<Tag> {
    const [existing] = await this.db
      .select()
      .from(tagTable)
      .where(eq(tagTable.name, name))
      .limit(1);

    if (existing) {
      return needsLegacySlugRepair(existing.slug)
        ? await this.repairTagSlug(existing.id, existing.name)
        : existing;
    }

    try {
      return await this.db.transaction(async (tx) => {
        const newTag: NewTag = {
          name,
          slug: this.buildPendingSlug(),
        };

        const [result] = await tx.insert(tagTable).values(newTag);
        const tagId = Number(result.insertId);
        await this.finalizeTagSlug(tx, tagId, name);

        const [tag] = await tx
          .select()
          .from(tagTable)
          .where(eq(tagTable.id, tagId))
          .limit(1);

        if (!tag) {
          throw HttpError.internal("Failed to create tag.");
        }

        return tag;
      });
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        const [existingTag] = await this.db
          .select()
          .from(tagTable)
          .where(eq(tagTable.name, name))
          .limit(1);

        if (existingTag) {
          return needsLegacySlugRepair(existingTag.slug)
            ? await this.repairTagSlug(existingTag.id, existingTag.name)
            : existingTag;
        }
      }

      throw error;
    }
  }

  private async repairTagSlug(id: number, name: string): Promise<Tag> {
    return await this.db.transaction(async (tx) => {
      await this.finalizeTagSlug(tx, id, name, id);

      const [updated] = await tx
        .select()
        .from(tagTable)
        .where(eq(tagTable.id, id))
        .limit(1);

      if (!updated) {
        throw HttpError.internal("Failed to repair tag slug.");
      }

      return updated;
    });
  }

  private buildPendingSlug(): string {
    return `__pending__${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private async resolveTagSlug(
    tx: MySql2Database<typeof schema>,
    name: string,
    tagId: number,
    excludeId?: number,
  ): Promise<string> {
    const preferredSlug = generateUnicodeSlug(name);

    if (isBlankSlug(preferredSlug)) {
      return await this.resolveFallbackSlug(tx, tagId, excludeId);
    }

    const existing = await tx
      .select({ id: tagTable.id })
      .from(tagTable)
      .where(eq(tagTable.slug, preferredSlug))
      .limit(1);

    if (existing.length === 0 || existing[0]?.id === excludeId) {
      return preferredSlug;
    }

    return await this.resolveFallbackSlug(tx, tagId, excludeId);
  }

  private async resolveFallbackSlug(
    tx: MySql2Database<typeof schema>,
    tagId: number,
    excludeId?: number,
  ): Promise<string> {
    const baseSlug = String(tagId);

    return await ensureUniqueSlug(baseSlug, async (checkSlug) => {
      const existing = await tx
        .select({ id: tagTable.id })
        .from(tagTable)
        .where(eq(tagTable.slug, checkSlug))
        .limit(1);

      if (existing.length === 0) {
        return false;
      }

      return excludeId === undefined || existing[0]?.id !== excludeId;
    });
  }

  private async finalizeTagSlug(
    tx: MySql2Database<typeof schema>,
    tagId: number,
    name: string,
    excludeId?: number,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const resolvedSlug = await this.resolveTagSlug(tx, name, tagId, excludeId);

      try {
        await tx.update(tagTable).set({ slug: resolvedSlug }).where(eq(tagTable.id, tagId));

        return resolvedSlug;
      } catch (error) {
        if (!this.isDuplicateEntry(error)) {
          throw error;
        }
      }
    }

    throw HttpError.internal("Failed to finalize tag slug.");
  }

  private isDuplicateEntry(error: unknown): error is { code: string } {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ER_DUP_ENTRY"
    );
  }
}
