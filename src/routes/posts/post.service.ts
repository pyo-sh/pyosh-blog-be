import {
  eq,
  and,
  isNull,
  sql,
  SQL,
  inArray,
  lt,
  gt,
  desc,
  asc,
  like,
  or,
} from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { connection } from "@src/db/client";
import { categoryTable } from "@src/db/schema/categories";
import { commentTable } from "@src/db/schema/comments";
import * as schema from "@src/db/schema/index";
import { postTagTable } from "@src/db/schema/post-tags";
import { Post, postTable, NewPost } from "@src/db/schema/posts";
import { statsDailyTable } from "@src/db/schema/stats";
import { tagTable } from "@src/db/schema/tags";
import { HttpError } from "@src/errors/http-error";
import { TagService } from "@src/routes/tags/tag.service";
import {
  buildPaginatedResponse,
  calculateOffset,
} from "@src/shared/pagination";
import {
  ensureUniqueSlug,
  generateUnicodeSlug,
  isBlankSlug,
} from "@src/shared/slug";

const MAX_PINNED_POSTS = 5;
const PINNED_POST_LIMIT_ERROR =
  "Pinned post limit exceeded. Maximum 5 pinned posts allowed.";
const PINNED_POST_LIMIT_LOCK_NAME = "post_pinned_limit";
const SUMMARY_MAX_LENGTH = 200;
type NamedLockRow = RowDataPacket & { acquired: number | null };

function extractPlainText(markdown: string, maxLength = SUMMARY_MAX_LENGTH) {
  const plainText = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[>*_~]/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  const ellipsis = "...";
  const safeLimit = Math.max(maxLength - ellipsis.length, 0);

  if (safeLimit === 0) {
    return ellipsis.slice(0, maxLength);
  }

  return `${plainText.slice(0, safeLimit).trimEnd()}${ellipsis}`;
}

function normalizeSummary(summary: string | null | undefined) {
  const trimmed = summary?.trim();

  return trimmed ? trimmed : null;
}

function needsLegacySlugRepair(slug: string | null | undefined) {
  if (isBlankSlug(slug)) {
    return true;
  }

  return /^-[0-9]+$/.test(slug.trim());
}

function resolvePublishedSummary(input: {
  status: "draft" | "published" | "archived";
  summary: string | null | undefined;
  contentMd: string;
}) {
  const normalizedSummary = normalizeSummary(input.summary);

  if (input.status !== "published") {
    return normalizedSummary;
  }

  return normalizedSummary ?? extractPlainText(input.contentMd);
}

/**
 * 게시글 생성 입력 데이터
 */
export interface CreatePostInput {
  title: string;
  contentMd: string;
  categoryId: number;
  summary?: string;
  description?: string;
  thumbnailUrl?: string | null;
  visibility?: "public" | "private";
  status?: "draft" | "published" | "archived";
  commentStatus?: "open" | "locked" | "disabled";
  isPinned?: boolean;
  tags?: string[];
  publishedAt?: Date;
}

/**
 * 게시글 수정 입력 데이터
 */
export interface UpdatePostInput {
  title?: string;
  contentMd?: string;
  categoryId?: number;
  summary?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  visibility?: "public" | "private";
  status?: "draft" | "published" | "archived";
  commentStatus?: "open" | "locked" | "disabled";
  isPinned?: boolean;
  tags?: string[];
  publishedAt?: Date;
}

/**
 * 게시글 목록 조회 쿼리
 */
export interface GetPostListQuery {
  page?: number;
  limit?: number;
  categoryId?: number;
  tagSlug?: string;
  q?: string;
  filter?:
    | "title_content"
    | "title"
    | "content"
    | "tag"
    | "category"
    | "comment";
  status?: "draft" | "published" | "archived";
  visibility?: "public" | "private";
  sort?: "published_at" | "created_at" | "totalPageviews" | "commentCount";
  order?: "asc" | "desc";
  includeDeleted?: boolean;
}

/**
 * 태그 정보
 */
interface PostTag {
  id: number;
  name: string;
  slug: string;
}

/**
 * 카테고리 정보 (목록용 - ancestors 없음)
 */
interface PostListCategory {
  id: number;
  name: string;
  slug: string;
}

/**
 * 카테고리 정보 (상세용 - ancestors 포함)
 */
interface PostDetailCategory extends PostListCategory {
  ancestors: Array<{ name: string; slug: string }>;
}

/**
 * 게시글 집계 필드
 */
interface PostAggregates {
  totalPageviews: number;
  commentCount: number;
}

/**
 * 게시글 목록 항목 (contentMd 제외)
 */
export type PostListItem = Omit<Post, "contentMd"> &
  PostAggregates & {
    category: PostListCategory;
    tags: PostTag[];
  };

/**
 * 게시글 상세 정보 (관계 + 집계 포함)
 */
export type PostDetail = Post &
  PostAggregates & {
    category: PostDetailCategory;
    tags: PostTag[];
  };

/**
 * 이전/다음 글 정보
 */
interface PostNavigation {
  slug: string;
  title: string;
}

/**
 * 게시글 상세 조회 응답 (이전/다음 글 포함)
 */
export interface PostDetailWithNavigation {
  post: PostDetail;
  prevPost: PostNavigation | null;
  nextPost: PostNavigation | null;
}

export interface PinnedPostCount {
  pinnedCount: number;
}

/**
 * slug 목록 항목 (sitemap용)
 */
export interface PostSlugItem {
  slug: string;
  updatedAt: Date;
}

/**
 * Post Service
 */
export class PostService {
  constructor(
    private readonly db: MySql2Database<typeof schema>,
    private readonly tagService: TagService,
  ) {}

  /**
   * 게시글 생성 (트랜잭션)
   */
  async createPost(input: CreatePostInput): Promise<PostDetail> {
    const runCreate = async () => {
      // MySQL REPEATABLE READ isolation 회피: 트랜잭션 시작 전에 태그 조회/생성
      const tagIds: number[] =
        input.tags && input.tags.length > 0
          ? await this.tagService.getOrCreateTags(input.tags)
          : [];

      return await this.db.transaction(async (tx) => {
        // 1. status가 'published'이고 publishedAt이 없으면 자동 설정
        let publishedAt = input.publishedAt;
        if (input.status === "published" && !publishedAt) {
          publishedAt = new Date();
        }

        // 2. 게시글 생성
        const newPost: NewPost = {
          title: input.title,
          slug: this.buildPendingSlug(),
          contentMd: input.contentMd,
          categoryId: input.categoryId,
          summary: resolvePublishedSummary({
            status: input.status ?? "draft",
            summary: input.summary,
            contentMd: input.contentMd,
          }),
          description: input.description ?? null,
          thumbnailUrl: input.thumbnailUrl ?? null,
          visibility: input.visibility ?? "public",
          status: input.status ?? "draft",
          commentStatus: input.commentStatus ?? "open",
          isPinned: input.isPinned ?? false,
          publishedAt,
        };

        const [result] = await tx.insert(postTable).values(newPost);
        const postId = Number(result.insertId);

        const resolvedSlug = await this.resolvePostSlug(
          tx,
          input.title,
          postId,
        );
        if (resolvedSlug !== newPost.slug) {
          await tx
            .update(postTable)
            .set({ slug: resolvedSlug })
            .where(eq(postTable.id, postId));
        }

        // 3. 태그 연결
        if (tagIds.length > 0) {
          await tx
            .insert(postTagTable)
            .values(tagIds.map((tagId) => ({ postId, tagId })));
        }

        // 4. 생성된 게시글 전체 조회
        return await this.getPostByIdInternal(postId, tx);
      });
    };

    if (input.isPinned === true) {
      return await this.withPinnedPostLimitLock(async () => {
        const pinnedCount = await this.countPinnedPosts(this.db);

        if (pinnedCount + 1 > MAX_PINNED_POSTS) {
          throw HttpError.conflict(PINNED_POST_LIMIT_ERROR);
        }

        return await runCreate();
      });
    }

    return await runCreate();
  }

  /**
   * 게시글 수정 (트랜잭션)
   */
  async updatePost(id: number, input: UpdatePostInput): Promise<PostDetail> {
    const runUpdate = async () => {
      // MySQL REPEATABLE READ isolation 회피: 트랜잭션 시작 전에 태그 조회/생성
      const newTagIds: number[] | undefined =
        input.tags !== undefined
          ? await this.tagService.getOrCreateTags(input.tags)
          : undefined;

      return await this.db.transaction(async (tx) => {
        // 1. 게시글 존재 확인
        const existing = await tx
          .select()
          .from(postTable)
          .where(eq(postTable.id, id))
          .limit(1);

        if (existing.length === 0) {
          throw HttpError.notFound("Post not found.");
        }

        const nextStatus = input.status ?? existing[0].status;
        const nextContentMd = input.contentMd ?? existing[0].contentMd;
        const nextSummary =
          input.summary !== undefined ? input.summary : existing[0].summary;
        const nextPublishedAt =
          input.publishedAt !== undefined
            ? input.publishedAt
            : existing[0].publishedAt;
        const needsSlugRepair = needsLegacySlugRepair(existing[0].slug);

        // 2. 게시글 수정
        const updateData: Partial<NewPost> = {
          ...input,
          updatedAt: new Date(),
        };

        updateData.summary = resolvePublishedSummary({
          status: nextStatus,
          summary: nextSummary,
          contentMd: nextContentMd,
        });

        if (nextStatus === "published" && !nextPublishedAt) {
          updateData.publishedAt = new Date();
        }

        // contentMd가 변경되면 contentModifiedAt 자동 갱신
        if (input.contentMd !== undefined) {
          updateData.contentModifiedAt = new Date();
        }

        if (needsSlugRepair) {
          updateData.slug = await this.resolvePostSlug(
            tx,
            input.title ?? existing[0].title,
            id,
            id,
          );
        }

        await tx.update(postTable).set(updateData).where(eq(postTable.id, id));

        // 3. 태그 갱신 (undefined vs 빈 배열 구분)
        if (newTagIds !== undefined) {
          // 기존 태그 연결 삭제
          await tx.delete(postTagTable).where(eq(postTagTable.postId, id));

          // 새 태그 연결
          if (newTagIds.length > 0) {
            await tx
              .insert(postTagTable)
              .values(newTagIds.map((tagId) => ({ postId: id, tagId })));
          }
        }

        // 4. 수정된 게시글 전체 조회
        return await this.getPostByIdInternal(id, tx);
      });
    };

    if (input.isPinned !== undefined) {
      return await this.withPinnedPostLimitLock(async () => {
        const [currentPost] = await this.db
          .select()
          .from(postTable)
          .where(eq(postTable.id, id))
          .limit(1);

        if (!currentPost) {
          throw HttpError.notFound("Post not found.");
        }

        const isCurrentlyActivePinned =
          currentPost.isPinned && currentPost.deletedAt === null;
        const isNextActivePinned =
          (input.isPinned ?? currentPost.isPinned) &&
          currentPost.deletedAt === null;

        if (!isCurrentlyActivePinned && isNextActivePinned) {
          const pinnedCount = await this.countPinnedPosts(this.db);

          if (pinnedCount + 1 > MAX_PINNED_POSTS) {
            throw HttpError.conflict(PINNED_POST_LIMIT_ERROR);
          }
        }

        return await runUpdate();
      });
    }

    return await runUpdate();
  }

  /**
   * 게시글 목록 조회 (페이지네이션)
   */
  async getPostList(query: GetPostListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sort = query.sort ?? "published_at";
    const order = query.order ?? "desc";

    // WHERE 조건 동적 조합
    const conditions = [];

    // 기본: deleted_at IS NULL
    if (!query.includeDeleted) {
      conditions.push(isNull(postTable.deletedAt));
    }

    // status 필터
    if (query.status) {
      conditions.push(eq(postTable.status, query.status));
    }

    // visibility 필터
    if (query.visibility) {
      conditions.push(eq(postTable.visibility, query.visibility));
    }

    // category 필터
    if (query.categoryId) {
      conditions.push(eq(postTable.categoryId, query.categoryId));
    }

    // 키워드 검색 (filter에 따라 검색 범위 결정)
    if (query.q) {
      const term = `%${query.q}%`;
      const filter = query.filter;

      if (filter === "title") {
        conditions.push(like(postTable.title, term));
      } else if (filter === "content") {
        conditions.push(like(postTable.contentMd, term));
      } else if (filter === "title_content") {
        conditions.push(
          or(like(postTable.title, term), like(postTable.contentMd, term))!,
        );
      } else if (filter === "tag") {
        const matchedTags = await this.db
          .select({ id: tagTable.id })
          .from(tagTable)
          .where(like(tagTable.name, term));
        if (matchedTags.length === 0) {
          return buildPaginatedResponse([], 0, page, limit);
        }
        const tagIds = matchedTags.map((t) => t.id);
        const postIdsFromTags = await this.db
          .select({ postId: postTagTable.postId })
          .from(postTagTable)
          .where(inArray(postTagTable.tagId, tagIds));
        const postIds = [...new Set(postIdsFromTags.map((pt) => pt.postId))];
        if (postIds.length === 0) {
          return buildPaginatedResponse([], 0, page, limit);
        }
        conditions.push(inArray(postTable.id, postIds));
      } else if (filter === "category") {
        const matchedCategories = await this.db
          .select({ id: categoryTable.id })
          .from(categoryTable)
          .where(like(categoryTable.name, term));
        if (matchedCategories.length === 0) {
          return buildPaginatedResponse([], 0, page, limit);
        }
        const categoryIds = matchedCategories.map((c) => c.id);
        conditions.push(inArray(postTable.categoryId, categoryIds));
      } else if (filter === "comment") {
        const matchedComments = await this.db
          .select({ postId: commentTable.postId })
          .from(commentTable)
          .where(this.buildVisibleCommentWhere(like(commentTable.body, term)));
        const postIds = [...new Set(matchedComments.map((c) => c.postId))];
        if (postIds.length === 0) {
          return buildPaginatedResponse([], 0, page, limit);
        }
        conditions.push(inArray(postTable.id, postIds));
      } else {
        // filter가 undefined인 경우 (직접 서비스 호출 등) title+content 검색으로 폴백
        conditions.push(
          or(like(postTable.title, term), like(postTable.contentMd, term))!,
        );
      }
    }

    // tag 필터 (tag slug 기반)
    // 참고: filter=tag + tagSlug를 동시에 사용하면 두 조건이 AND로 결합됩니다.
    if (query.tagSlug) {
      const [tag] = await this.db
        .select({ id: tagTable.id })
        .from(tagTable)
        .where(eq(tagTable.slug, query.tagSlug))
        .limit(1);

      if (!tag) {
        return buildPaginatedResponse([], 0, page, limit);
      }

      const postTags = await this.db
        .select({ postId: postTagTable.postId })
        .from(postTagTable)
        .where(eq(postTagTable.tagId, tag.id));

      const tagFilteredPostIds = postTags.map((pt) => pt.postId);

      // 해당 태그를 가진 게시글이 없으면 빈 배열 반환
      if (tagFilteredPostIds.length === 0) {
        return buildPaginatedResponse([], 0, page, limit);
      }

      conditions.push(inArray(postTable.id, tagFilteredPostIds));
    }

    // WHERE 조건 결합
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // COUNT 쿼리
    const [{ total }] = await this.db
      .select({ total: sql<number>`COUNT(*)` })
      .from(postTable)
      .where(whereClause);

    // SELECT + ORDER BY + LIMIT/OFFSET
    const offset = calculateOffset(page, limit);
    const orderColumn =
      sort === "published_at" ? postTable.publishedAt : postTable.createdAt;
    const orderFn = order === "asc" ? sql`ASC` : sql`DESC`;

    let posts: Post[];

    if (sort === "totalPageviews" || sort === "commentCount") {
      const statsSubquery = this.db
        .select({
          postId: statsDailyTable.postId,
          totalPageviews:
            sql<number>`COALESCE(SUM(${statsDailyTable.pageviews}), 0)`.as(
              "totalPageviews",
            ),
        })
        .from(statsDailyTable)
        .groupBy(statsDailyTable.postId)
        .as("post_stats");

      const commentsSubquery = this.db
        .select({
          postId: commentTable.postId,
          commentCount: sql<number>`COUNT(*)`.as("commentCount"),
        })
        .from(commentTable)
        .where(this.buildVisibleCommentWhere())
        .groupBy(commentTable.postId)
        .as("post_comments");

      const aggregateColumn =
        sort === "totalPageviews"
          ? sql`COALESCE(${statsSubquery.totalPageviews}, 0)`
          : sql`COALESCE(${commentsSubquery.commentCount}, 0)`;

      const rows = await this.db
        .select({ post: postTable })
        .from(postTable)
        .leftJoin(statsSubquery, eq(statsSubquery.postId, postTable.id))
        .leftJoin(commentsSubquery, eq(commentsSubquery.postId, postTable.id))
        .where(whereClause)
        .orderBy(
          sql`${aggregateColumn} ${orderFn}`,
          sql`${postTable.id} ${orderFn}`,
        )
        .limit(limit)
        .offset(offset);

      posts = rows.map((row) => row.post);
    } else {
      posts = await this.db
        .select()
        .from(postTable)
        .where(whereClause)
        .orderBy(sql`${orderColumn} ${orderFn}`)
        .limit(limit)
        .offset(offset);
    }

    // 각 post에 category, tags, 집계 정보 추가 (목록용 - contentMd/ancestors 제외, 배치)
    const postsWithDetails = await this.enrichPostListItems(posts);

    return buildPaginatedResponse(postsWithDetails, total, page, limit);
  }

  /**
   * 게시글 slug로 조회 (이전/다음 글 포함)
   */
  async getPostBySlug(slug: string): Promise<PostDetailWithNavigation> {
    // 1. 게시글 조회
    const [post] = await this.db
      .select()
      .from(postTable)
      .where(and(eq(postTable.slug, slug), isNull(postTable.deletedAt)))
      .limit(1);

    if (!post) {
      throw HttpError.notFound("게시글을 찾을 수 없습니다");
    }

    const postDetail = await this.enrichPostWithDetails(post);

    // 2. 이전 글 조회 (published_at < current, status = 'published', ORDER BY published_at DESC)
    const prevPosts = await this.db
      .select({
        slug: postTable.slug,
        title: postTable.title,
      })
      .from(postTable)
      .where(
        and(
          lt(postTable.publishedAt, post.publishedAt),
          eq(postTable.status, "published"),
          isNull(postTable.deletedAt),
        ),
      )
      .orderBy(desc(postTable.publishedAt))
      .limit(1);

    // 3. 다음 글 조회 (published_at > current, status = 'published', ORDER BY published_at ASC)
    const nextPosts = await this.db
      .select({
        slug: postTable.slug,
        title: postTable.title,
      })
      .from(postTable)
      .where(
        and(
          gt(postTable.publishedAt, post.publishedAt),
          eq(postTable.status, "published"),
          isNull(postTable.deletedAt),
        ),
      )
      .orderBy(asc(postTable.publishedAt))
      .limit(1);

    return {
      post: postDetail,
      prevPost: prevPosts[0] ?? null,
      nextPost: nextPosts[0] ?? null,
    };
  }

  /**
   * 발행된 글 slug 목록 조회 (sitemap용)
   */
  async getPostSlugs(): Promise<PostSlugItem[]> {
    const rows = await this.db
      // Google Sitemap 50,000 URLs/file 제한에 맞춰 현재는 상한을 둔다.
      .select({ slug: postTable.slug, updatedAt: postTable.updatedAt })
      .from(postTable)
      .where(
        and(
          eq(postTable.status, "published"),
          eq(postTable.visibility, "public"),
          isNull(postTable.deletedAt),
        ),
      )
      .orderBy(desc(postTable.updatedAt))
      .limit(50000);

    return rows;
  }

  /**
   * 게시글 ID로 조회 (Admin용)
   */
  async getPostById(id: number): Promise<PostDetail> {
    const [post] = await this.db
      .select()
      .from(postTable)
      .where(eq(postTable.id, id))
      .limit(1);

    if (!post) {
      throw HttpError.notFound("게시글을 찾을 수 없습니다");
    }

    return await this.enrichPostWithDetails(post);
  }

  async getPinnedPostCount(): Promise<PinnedPostCount> {
    const pinnedCount = await this.countPinnedPosts(this.db);

    return { pinnedCount };
  }

  /**
   * 게시글 Soft Delete
   */
  async deletePost(id: number): Promise<void> {
    const [post] = await this.db
      .select({
        isPinned: postTable.isPinned,
        deletedAt: postTable.deletedAt,
      })
      .from(postTable)
      .where(eq(postTable.id, id))
      .limit(1);

    if (!post) {
      throw HttpError.notFound("게시글을 찾을 수 없습니다");
    }

    const runDelete = async () => {
      await this.db
        .update(postTable)
        .set({ deletedAt: new Date() })
        .where(eq(postTable.id, id));
    };

    if (post.isPinned && post.deletedAt === null) {
      await this.withPinnedPostLimitLock(runDelete);

      return;
    }

    await runDelete();
  }

  /**
   * 게시글 복원
   */
  async restorePost(id: number): Promise<PostDetail> {
    return await this.withPinnedPostLimitLock(async () => {
      const [currentPost] = await this.db
        .select()
        .from(postTable)
        .where(eq(postTable.id, id))
        .limit(1);

      if (!currentPost) {
        throw HttpError.notFound("게시글을 찾을 수 없습니다");
      }

      if (currentPost.isPinned && currentPost.deletedAt !== null) {
        const pinnedCount = await this.countPinnedPosts(this.db);

        if (pinnedCount + 1 > MAX_PINNED_POSTS) {
          throw HttpError.conflict(PINNED_POST_LIMIT_ERROR);
        }
      }

      return await this.db.transaction(async (tx) => {
        // 락 획득 후 최신 상태를 기준으로 복원한다.
        await tx
          .update(postTable)
          .set({ deletedAt: null })
          .where(eq(postTable.id, id));

        return await this.getPostByIdInternal(id, tx);
      });
    });
  }

  /**
   * 게시글 Hard Delete (Admin용)
   * 연쇄 삭제: 댓글 → 조회수 통계 → 태그 관계 → 고아 태그 → 게시글
   */
  async hardDeletePost(id: number): Promise<void> {
    await this.withPinnedPostLimitLock(async () => {
      await this.db.transaction(async (tx) => {
        // 1. 게시글 존재 확인
        const [post] = await tx
          .select()
          .from(postTable)
          .where(eq(postTable.id, id))
          .limit(1);

        if (!post) {
          throw HttpError.notFound("Post not found.");
        }

        // 2. post_tag_tb 연결에서 사용된 tagId 수집 (고아 태그 감지용)
        const linkedTags = await tx
          .select({ tagId: postTagTable.tagId })
          .from(postTagTable)
          .where(eq(postTagTable.postId, id));
        const linkedTagIds = linkedTags.map((r) => r.tagId);

        // 3. 댓글 삭제
        await tx.delete(commentTable).where(eq(commentTable.postId, id));

        // 4. 조회수 통계 삭제
        await tx.delete(statsDailyTable).where(eq(statsDailyTable.postId, id));

        // 5. post_tag_tb 연결 삭제
        await tx.delete(postTagTable).where(eq(postTagTable.postId, id));

        // 6. post_tb 레코드 삭제
        await tx.delete(postTable).where(eq(postTable.id, id));

        // 7. 고아 태그 삭제 (다른 게시글에서 사용하지 않는 태그)
        await this.cleanOrphanTags(tx, linkedTagIds);
      });
    });
  }

  /**
   * 게시글 벌크 작업 (단일 트랜잭션)
   */
  async bulkUpdatePosts(input: {
    ids: number[];
    action: "update" | "soft_delete" | "restore" | "hard_delete";
    categoryId?: number;
    commentStatus?: "open" | "locked" | "disabled";
  }): Promise<void> {
    const { action } = input;
    const uniqueIds = [...new Set(input.ids)];

    const run = async () =>
      await this.db.transaction(async (tx) => {
        // 모든 대상 게시글 존재 확인 (deletedAt 필터 없음 — 소프트 삭제된 글도 admin이 조작 가능)
        const found = await tx
          .select({
            id: postTable.id,
            isPinned: postTable.isPinned,
            deletedAt: postTable.deletedAt,
          })
          .from(postTable)
          .where(inArray(postTable.id, uniqueIds));

        if (found.length !== uniqueIds.length) {
          throw HttpError.notFound("One or more posts not found.");
        }

        if (action === "update") {
          if (input.categoryId !== undefined) {
            const [cat] = await tx
              .select({ id: categoryTable.id })
              .from(categoryTable)
              .where(eq(categoryTable.id, input.categoryId))
              .limit(1);
            if (!cat)
              throw HttpError.notFound(
                `Category ${input.categoryId} not found.`,
              );
          }
          const updateData: Partial<{
            categoryId: number;
            commentStatus: "open" | "locked" | "disabled";
            updatedAt: Date;
          }> = {
            updatedAt: new Date(),
          };
          if (input.categoryId !== undefined)
            updateData.categoryId = input.categoryId;
          if (input.commentStatus !== undefined)
            updateData.commentStatus = input.commentStatus;
          await tx
            .update(postTable)
            .set(updateData)
            .where(inArray(postTable.id, uniqueIds));
        } else if (action === "soft_delete") {
          await tx
            .update(postTable)
            .set({ deletedAt: new Date() })
            .where(inArray(postTable.id, uniqueIds));
        } else if (action === "restore") {
          const pinnedPostsToRestore = found.filter(
            (post) => post.isPinned && post.deletedAt !== null,
          ).length;

          if (pinnedPostsToRestore > 0) {
            const pinnedCount = await this.countPinnedPosts(tx);

            if (pinnedCount + pinnedPostsToRestore > MAX_PINNED_POSTS) {
              throw HttpError.conflict(PINNED_POST_LIMIT_ERROR);
            }
          }

          await tx
            .update(postTable)
            .set({ deletedAt: null })
            .where(inArray(postTable.id, uniqueIds));
        } else if (action === "hard_delete") {
          // 연결된 tagId 수집 (고아 태그 감지용)
          const linkedTags = await tx
            .select({ tagId: postTagTable.tagId })
            .from(postTagTable)
            .where(inArray(postTagTable.postId, uniqueIds));
          const linkedTagIds = [...new Set(linkedTags.map((r) => r.tagId))];

          // 댓글, 통계, 태그 관계, 게시글 순서로 삭제
          await tx
            .delete(commentTable)
            .where(inArray(commentTable.postId, uniqueIds));
          await tx
            .delete(statsDailyTable)
            .where(inArray(statsDailyTable.postId, uniqueIds));
          await tx
            .delete(postTagTable)
            .where(inArray(postTagTable.postId, uniqueIds));
          await tx.delete(postTable).where(inArray(postTable.id, uniqueIds));

          // 고아 태그 삭제
          await this.cleanOrphanTags(tx, linkedTagIds);
        }
      });

    const shouldLockBulk = (
      await this.db
        .select({
          isPinned: postTable.isPinned,
          deletedAt: postTable.deletedAt,
        })
        .from(postTable)
        .where(inArray(postTable.id, uniqueIds))
    ).some((post) =>
      action === "restore"
        ? post.isPinned && post.deletedAt !== null
        : (action === "soft_delete" || action === "hard_delete") &&
          post.isPinned &&
          post.deletedAt === null,
    );

    if (shouldLockBulk) {
      await this.withPinnedPostLimitLock(run);

      return;
    }

    await run();
  }

  /**
   * 고아 태그 삭제 (다른 게시글에서 사용하지 않는 태그)
   * post_tag_tb에서 tagIds가 참조되지 않으면 tag_tb에서 삭제한다.
   */
  private async cleanOrphanTags(
    tx: MySql2Database<typeof schema>,
    tagIds: number[],
  ): Promise<void> {
    if (tagIds.length === 0) return;
    const stillUsed = await tx
      .select({ tagId: postTagTable.tagId })
      .from(postTagTable)
      .where(inArray(postTagTable.tagId, tagIds));
    const stillUsedIds = new Set(stillUsed.map((r) => r.tagId));
    const orphanIds = tagIds.filter((id) => !stillUsedIds.has(id));
    if (orphanIds.length > 0) {
      await tx.delete(tagTable).where(inArray(tagTable.id, orphanIds));
    }
  }

  /**
   * 게시글 목록 일괄 조회 (4개 쿼리로 N개 포스트 처리, contentMd/ancestors 제외)
   */
  private async enrichPostListItems(posts: Post[]): Promise<PostListItem[]> {
    if (posts.length === 0) return [];

    const postIds = posts.map((p) => p.id);
    const categoryIds = [...new Set(posts.map((p) => p.categoryId))];

    const [categories, allPostTags, statsRows, commentRows] = await Promise.all(
      [
        this.db
          .select({
            id: categoryTable.id,
            name: categoryTable.name,
            slug: categoryTable.slug,
          })
          .from(categoryTable)
          .where(inArray(categoryTable.id, categoryIds)),
        this.db
          .select({
            postId: postTagTable.postId,
            id: tagTable.id,
            name: tagTable.name,
            slug: tagTable.slug,
          })
          .from(postTagTable)
          .innerJoin(tagTable, eq(postTagTable.tagId, tagTable.id))
          .where(inArray(postTagTable.postId, postIds)),
        this.db
          .select({
            postId: statsDailyTable.postId,
            total: sql<number>`COALESCE(SUM(${statsDailyTable.pageviews}), 0)`,
          })
          .from(statsDailyTable)
          .where(inArray(statsDailyTable.postId, postIds))
          .groupBy(statsDailyTable.postId),
        this.db
          .select({ postId: commentTable.postId, count: sql<number>`COUNT(*)` })
          .from(commentTable)
          .where(
            this.buildVisibleCommentWhere(
              inArray(commentTable.postId, postIds),
            ),
          )
          .groupBy(commentTable.postId),
      ],
    );

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const tagsMap = new Map<number, PostTag[]>();
    for (const t of allPostTags) {
      if (!tagsMap.has(t.postId)) tagsMap.set(t.postId, []);
      tagsMap.get(t.postId)!.push({ id: t.id, name: t.name, slug: t.slug });
    }
    const statsMap = new Map(statsRows.map((r) => [r.postId, Number(r.total)]));
    const commentMap = new Map(
      commentRows.map((r) => [r.postId, Number(r.count)]),
    );

    return posts.map(({ contentMd: _c, ...post }) => {
      const category = catMap.get(post.categoryId);
      if (!category)
        throw HttpError.notFound(
          `Category ${post.categoryId} not found for post ${post.id}`,
        );

      return {
        ...post,
        category,
        tags: tagsMap.get(post.id) ?? [],
        totalPageviews: statsMap.get(post.id) ?? 0,
        commentCount: commentMap.get(post.id) ?? 0,
      };
    });
  }

  private buildPendingSlug(): string {
    return `__pending__${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private async resolvePostSlug(
    tx: MySql2Database<typeof schema>,
    title: string,
    postId: number,
    excludeId?: number,
  ): Promise<string> {
    const preferredSlug = generateUnicodeSlug(title);

    if (isBlankSlug(preferredSlug)) {
      return await this.resolveFallbackSlug(tx, postId, excludeId);
    }

    const existing = await tx
      .select({ id: postTable.id })
      .from(postTable)
      .where(eq(postTable.slug, preferredSlug))
      .limit(1);

    if (existing.length === 0 || existing[0]?.id === excludeId) {
      return preferredSlug;
    }

    return await this.resolveFallbackSlug(tx, postId, excludeId);
  }

  private async resolveFallbackSlug(
    tx: MySql2Database<typeof schema>,
    postId: number,
    excludeId?: number,
  ): Promise<string> {
    const baseSlug = String(postId);

    return await ensureUniqueSlug(baseSlug, async (checkSlug) => {
      const existing = await tx
        .select({ id: postTable.id })
        .from(postTable)
        .where(eq(postTable.slug, checkSlug))
        .limit(1);

      if (existing.length === 0) {
        return false;
      }

      return excludeId === undefined || existing[0]?.id !== excludeId;
    });
  }

  /**
   * 게시글 상세 정보 조회 (category ancestors + 집계 포함)
   */
  private async enrichPostWithDetails(post: Post): Promise<PostDetail> {
    const [category, postTags, totalPageviews, commentCount, ancestors] =
      await Promise.all([
        this.db
          .select({
            id: categoryTable.id,
            name: categoryTable.name,
            slug: categoryTable.slug,
          })
          .from(categoryTable)
          .where(eq(categoryTable.id, post.categoryId))
          .limit(1)
          .then((rows) => rows[0]),
        this.db
          .select({ id: tagTable.id, name: tagTable.name, slug: tagTable.slug })
          .from(postTagTable)
          .innerJoin(tagTable, eq(postTagTable.tagId, tagTable.id))
          .where(eq(postTagTable.postId, post.id)),
        this.db
          .select({
            total: sql<number>`COALESCE(SUM(${statsDailyTable.pageviews}), 0)`,
          })
          .from(statsDailyTable)
          .where(eq(statsDailyTable.postId, post.id))
          .then((rows) => Number(rows[0]?.total ?? 0)),
        this.db
          .select({ count: sql<number>`COUNT(*)` })
          .from(commentTable)
          .where(
            this.buildVisibleCommentWhere(eq(commentTable.postId, post.id)),
          )
          .then((rows) => Number(rows[0]?.count ?? 0)),
        this.fetchCategoryAncestors(post.categoryId, this.db),
      ]);

    if (!category)
      throw HttpError.notFound(
        `Category ${post.categoryId} not found for post ${post.id}`,
      );

    return {
      ...post,
      category: { ...category, ancestors },
      tags: postTags,
      totalPageviews,
      commentCount,
    };
  }

  /**
   * 카테고리 ancestors 조회 - parentId 체인을 순회 (전체 테이블 스캔 없음, 순환 참조 방지)
   */
  private async fetchCategoryAncestors(
    categoryId: number,
    db: MySql2Database<typeof schema>,
  ): Promise<Array<{ name: string; slug: string }>> {
    const ancestors: Array<{ name: string; slug: string }> = [];
    const visited = new Set<number>([categoryId]);

    const [direct] = await db
      .select({ parentId: categoryTable.parentId })
      .from(categoryTable)
      .where(eq(categoryTable.id, categoryId))
      .limit(1);

    let parentId = direct?.parentId ?? null;
    const MAX_DEPTH = 10;
    let depth = 0;

    while (parentId != null && !visited.has(parentId) && depth < MAX_DEPTH) {
      depth++;
      visited.add(parentId);
      const [parent] = await db
        .select({
          id: categoryTable.id,
          name: categoryTable.name,
          slug: categoryTable.slug,
          parentId: categoryTable.parentId,
        })
        .from(categoryTable)
        .where(eq(categoryTable.id, parentId))
        .limit(1);

      if (!parent) break;
      ancestors.unshift({ name: parent.name, slug: parent.slug });
      parentId = parent.parentId;
    }

    return ancestors;
  }

  /**
   * 게시글 ID로 조회 (트랜잭션 내부용)
   */
  private async getPostByIdInternal(
    id: number,
    tx: MySql2Database<typeof schema>,
  ): Promise<PostDetail> {
    const [post] = await tx
      .select()
      .from(postTable)
      .where(eq(postTable.id, id))
      .limit(1);

    if (!post) {
      throw HttpError.notFound("게시글을 찾을 수 없습니다");
    }

    const [category, postTags, totalPageviews, commentCount, ancestors] =
      await Promise.all([
        tx
          .select({
            id: categoryTable.id,
            name: categoryTable.name,
            slug: categoryTable.slug,
          })
          .from(categoryTable)
          .where(eq(categoryTable.id, post.categoryId))
          .limit(1)
          .then((rows) => rows[0]),
        tx
          .select({ id: tagTable.id, name: tagTable.name, slug: tagTable.slug })
          .from(postTagTable)
          .innerJoin(tagTable, eq(postTagTable.tagId, tagTable.id))
          .where(eq(postTagTable.postId, post.id)),
        tx
          .select({
            total: sql<number>`COALESCE(SUM(${statsDailyTable.pageviews}), 0)`,
          })
          .from(statsDailyTable)
          .where(eq(statsDailyTable.postId, post.id))
          .then((rows) => Number(rows[0]?.total ?? 0)),
        tx
          .select({ count: sql<number>`COUNT(*)` })
          .from(commentTable)
          .where(
            this.buildVisibleCommentWhere(eq(commentTable.postId, post.id)),
          )
          .then((rows) => Number(rows[0]?.count ?? 0)),
        this.fetchCategoryAncestors(post.categoryId, tx),
      ]);

    if (!category)
      throw HttpError.notFound(
        `Category ${post.categoryId} not found for post ${post.id}`,
      );

    return {
      ...post,
      category: { ...category, ancestors },
      tags: postTags,
      totalPageviews,
      commentCount,
    };
  }

  private async countPinnedPosts(
    executor: Pick<MySql2Database<typeof schema>, "select">,
  ): Promise<number> {
    const [result] = await executor
      .select({ total: sql<number>`COUNT(*)` })
      .from(postTable)
      .where(and(eq(postTable.isPinned, true), isNull(postTable.deletedAt)));

    return Number(result?.total ?? 0);
  }

  private buildVisibleCommentWhere(postFilter?: SQL<unknown>) {
    const conditions = [
      eq(commentTable.status, "active"),
      isNull(commentTable.deletedAt),
      or(
        isNull(commentTable.parentId),
        sql`exists (
          select 1
          from comment_tb parent
          where parent.id = ${commentTable.parentId}
            and parent.status = 'active'
            and parent.deleted_at is null
        )`,
      ),
    ];

    if (postFilter) {
      conditions.unshift(postFilter);
    }

    return and(...conditions);
  }

  private async withPinnedPostLimitLock<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const lockConnection = await connection.getConnection();

    try {
      const [lockRows] = await lockConnection.query<NamedLockRow[]>(
        "SELECT GET_LOCK(?, 10) AS acquired",
        [PINNED_POST_LIMIT_LOCK_NAME],
      );
      const acquired = Number(lockRows[0]?.acquired ?? 0);

      if (acquired !== 1) {
        throw HttpError.internal("Failed to acquire pinned post limit lock.");
      }

      return await operation();
    } finally {
      await this.releasePinnedPostLimitLock(lockConnection);
      lockConnection.release();
    }
  }

  private async releasePinnedPostLimitLock(
    lockConnection: PoolConnection,
  ): Promise<void> {
    try {
      await lockConnection.query("SELECT RELEASE_LOCK(?)", [
        PINNED_POST_LIMIT_LOCK_NAME,
      ]);
    } catch {
      // Ignore release errors; the connection release closes the lock lifecycle.
    }
  }
}
