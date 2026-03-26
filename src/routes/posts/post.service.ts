import { eq, and, isNull, sql, inArray, lt, gt, desc, asc, like, or } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
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
import { generateSlug, ensureUniqueSlug } from "@src/shared/slug";

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
  filter?: "title_content" | "title" | "content" | "tag" | "category" | "comment";
  status?: "draft" | "published" | "archived";
  visibility?: "public" | "private";
  sort?: "published_at" | "created_at";
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
  ancestors: { name: string; slug: string }[];
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
export type PostListItem = Omit<Post, "contentMd"> & PostAggregates & {
  category: PostListCategory;
  tags: PostTag[];
};

/**
 * 게시글 상세 정보 (관계 + 집계 포함)
 */
export type PostDetail = Post & PostAggregates & {
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
    // MySQL REPEATABLE READ isolation 회피: 트랜잭션 시작 전에 태그 조회/생성
    const tagIds: number[] =
      input.tags && input.tags.length > 0
        ? await this.tagService.getOrCreateTags(input.tags)
        : [];

    return await this.db.transaction(async (tx) => {
      // 1. slug 생성 및 중복 확인
      const baseSlug = generateSlug(input.title);
      const slug = await ensureUniqueSlug(baseSlug, async (checkSlug) => {
        const existing = await tx
          .select()
          .from(postTable)
          .where(eq(postTable.slug, checkSlug))
          .limit(1);

        return existing.length > 0;
      });

      // 2. status가 'published'이고 publishedAt이 없으면 자동 설정
      let publishedAt = input.publishedAt;
      if (input.status === "published" && !publishedAt) {
        publishedAt = new Date();
      }

      // 3. 게시글 생성
      const newPost: NewPost = {
        title: input.title,
        slug,
        contentMd: input.contentMd,
        categoryId: input.categoryId,
        summary: input.summary ?? null,
        description: input.description ?? null,
        thumbnailUrl: input.thumbnailUrl ?? null,
        visibility: input.visibility ?? "public",
        status: input.status ?? "draft",
        commentStatus: input.commentStatus ?? "open",
        isPinned: input.isPinned ?? false,
        publishedAt,
      };

      const [result] = await tx.insert(postTable).values(newPost);
      const postId = result.insertId;

      // 4. 태그 연결
      if (tagIds.length > 0) {
        await tx
          .insert(postTagTable)
          .values(tagIds.map((tagId) => ({ postId, tagId })));
      }

      // 5. 생성된 게시글 전체 조회
      return await this.getPostByIdInternal(postId, tx);
    });
  }

  /**
   * 게시글 수정 (트랜잭션)
   */
  async updatePost(id: number, input: UpdatePostInput): Promise<PostDetail> {
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

      // 2. 게시글 수정
      const updateData: Partial<NewPost> = {
        ...input,
        updatedAt: new Date(),
      };

      // contentMd가 변경되면 contentModifiedAt 자동 갱신
      if (input.contentMd !== undefined) {
        updateData.contentModifiedAt = new Date();
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
      const filter = query.filter ?? "title_content";

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
          return buildPaginatedResponse([], page, limit, 0);
        }
        const tagIds = matchedTags.map((t) => t.id);
        const postIdsFromTags = await this.db
          .select({ postId: postTagTable.postId })
          .from(postTagTable)
          .where(inArray(postTagTable.tagId, tagIds));
        const postIds = [...new Set(postIdsFromTags.map((pt) => pt.postId))];
        if (postIds.length === 0) {
          return buildPaginatedResponse([], page, limit, 0);
        }
        conditions.push(inArray(postTable.id, postIds));
      } else if (filter === "category") {
        const matchedCategories = await this.db
          .select({ id: categoryTable.id })
          .from(categoryTable)
          .where(like(categoryTable.name, term));
        if (matchedCategories.length === 0) {
          return buildPaginatedResponse([], page, limit, 0);
        }
        const categoryIds = matchedCategories.map((c) => c.id);
        conditions.push(inArray(postTable.categoryId, categoryIds));
      } else if (filter === "comment") {
        const matchedComments = await this.db
          .select({ postId: commentTable.postId })
          .from(commentTable)
          .where(and(like(commentTable.body, term), isNull(commentTable.deletedAt)));
        const postIds = [...new Set(matchedComments.map((c) => c.postId))];
        if (postIds.length === 0) {
          return buildPaginatedResponse([], page, limit, 0);
        }
        conditions.push(inArray(postTable.id, postIds));
      }
    }

    // tag 필터 (tag slug 기반)
    if (query.tagSlug) {
      const [tag] = await this.db
        .select({ id: tagTable.id })
        .from(tagTable)
        .where(eq(tagTable.slug, query.tagSlug))
        .limit(1);

      if (!tag) {
        return buildPaginatedResponse([], page, limit, 0);
      }

      const postTags = await this.db
        .select({ postId: postTagTable.postId })
        .from(postTagTable)
        .where(eq(postTagTable.tagId, tag.id));

      const tagFilteredPostIds = postTags.map((pt) => pt.postId);

      // 해당 태그를 가진 게시글이 없으면 빈 배열 반환
      if (tagFilteredPostIds.length === 0) {
        return buildPaginatedResponse([], page, limit, 0);
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

    const posts = await this.db
      .select()
      .from(postTable)
      .where(whereClause)
      .orderBy(sql`${orderColumn} ${orderFn}`)
      .limit(limit)
      .offset(offset);

    // 각 post에 category, tags, 집계 정보 추가 (목록용 - contentMd/ancestors 제외)
    const postsWithDetails = await Promise.all(
      posts.map((post) => this.enrichPostListItemWithDetails(post)),
    );

    return buildPaginatedResponse(postsWithDetails, page, limit, total);
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
      .select({ slug: postTable.slug, updatedAt: postTable.updatedAt })
      .from(postTable)
      .where(
        and(
          eq(postTable.status, "published"),
          eq(postTable.visibility, "public"),
          isNull(postTable.deletedAt),
        ),
      )
      .orderBy(desc(postTable.updatedAt));

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

  /**
   * 게시글 Soft Delete
   */
  async deletePost(id: number): Promise<void> {
    // 1. 게시글 존재 확인
    const [post] = await this.db
      .select()
      .from(postTable)
      .where(eq(postTable.id, id))
      .limit(1);

    if (!post) {
      throw HttpError.notFound("게시글을 찾을 수 없습니다");
    }

    // 2. Soft delete
    await this.db
      .update(postTable)
      .set({ deletedAt: new Date() })
      .where(eq(postTable.id, id));
  }

  /**
   * 게시글 복원
   */
  async restorePost(id: number): Promise<PostDetail> {
    // 1. 게시글 존재 확인
    const [post] = await this.db
      .select()
      .from(postTable)
      .where(eq(postTable.id, id))
      .limit(1);

    if (!post) {
      throw HttpError.notFound("게시글을 찾을 수 없습니다");
    }

    // 2. 복원
    await this.db
      .update(postTable)
      .set({ deletedAt: null })
      .where(eq(postTable.id, id));

    // 3. 복원된 게시글 조회
    return await this.getPostById(id);
  }

  /**
   * 게시글 Hard Delete (Admin용)
   */
  async hardDeletePost(id: number): Promise<void> {
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

      // 2. post_tag_tb 연결 삭제
      await tx.delete(postTagTable).where(eq(postTagTable.postId, id));

      // 3. post_tb 레코드 삭제
      await tx.delete(postTable).where(eq(postTable.id, id));
    });
  }

  /**
   * 게시글 상세 정보 조회 (category ancestors + 집계 포함)
   */
  private async enrichPostWithDetails(post: Post): Promise<PostDetail> {
    const [category, postTags, totalPageviews, commentCount, ancestors] =
      await Promise.all([
        this.db
          .select({ id: categoryTable.id, name: categoryTable.name, slug: categoryTable.slug })
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
          .select({ total: sql<number>`COALESCE(SUM(${statsDailyTable.pageviews}), 0)` })
          .from(statsDailyTable)
          .where(eq(statsDailyTable.postId, post.id))
          .then((rows) => Number(rows[0]?.total ?? 0)),
        this.db
          .select({ count: sql<number>`COUNT(*)` })
          .from(commentTable)
          .where(and(eq(commentTable.postId, post.id), isNull(commentTable.deletedAt)))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        this.db
          .select({ id: categoryTable.id, name: categoryTable.name, slug: categoryTable.slug, parentId: categoryTable.parentId })
          .from(categoryTable)
          .then((rows) => rows),
      ]);

    return {
      ...post,
      category: {
        ...category,
        ancestors: this.buildAncestors(category.id, ancestors),
      },
      tags: postTags,
      totalPageviews,
      commentCount,
    };
  }

  /**
   * 게시글 목록 항목 조회 (contentMd/ancestors 제외, 집계 포함)
   */
  private async enrichPostListItemWithDetails(post: Post): Promise<PostListItem> {
    const { contentMd: _contentMd, ...postWithoutContent } = post;

    const [category, postTags, totalPageviews, commentCount] =
      await Promise.all([
        this.db
          .select({ id: categoryTable.id, name: categoryTable.name, slug: categoryTable.slug })
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
          .select({ total: sql<number>`COALESCE(SUM(${statsDailyTable.pageviews}), 0)` })
          .from(statsDailyTable)
          .where(eq(statsDailyTable.postId, post.id))
          .then((rows) => Number(rows[0]?.total ?? 0)),
        this.db
          .select({ count: sql<number>`COUNT(*)` })
          .from(commentTable)
          .where(and(eq(commentTable.postId, post.id), isNull(commentTable.deletedAt)))
          .then((rows) => Number(rows[0]?.count ?? 0)),
      ]);

    return {
      ...postWithoutContent,
      category,
      tags: postTags,
      totalPageviews,
      commentCount,
    };
  }

  /**
   * 카테고리 ancestors 빌드 (루트부터 부모까지, 직속 카테고리 제외)
   */
  private buildAncestors(
    categoryId: number,
    allCategories: { id: number; name: string; slug: string; parentId: number | null }[],
  ): { name: string; slug: string }[] {
    const categoryMap = new Map(allCategories.map((c) => [c.id, c]));
    const ancestors: { name: string; slug: string }[] = [];

    let current = categoryMap.get(categoryId);
    while (current?.parentId != null) {
      const parent = categoryMap.get(current.parentId);
      if (!parent) break;
      ancestors.unshift({ name: parent.name, slug: parent.slug });
      current = parent;
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

    const [category, postTags, totalPageviews, commentCount, allCategories] =
      await Promise.all([
        tx
          .select({ id: categoryTable.id, name: categoryTable.name, slug: categoryTable.slug })
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
          .select({ total: sql<number>`COALESCE(SUM(${statsDailyTable.pageviews}), 0)` })
          .from(statsDailyTable)
          .where(eq(statsDailyTable.postId, post.id))
          .then((rows) => Number(rows[0]?.total ?? 0)),
        tx
          .select({ count: sql<number>`COUNT(*)` })
          .from(commentTable)
          .where(and(eq(commentTable.postId, post.id), isNull(commentTable.deletedAt)))
          .then((rows) => Number(rows[0]?.count ?? 0)),
        tx
          .select({ id: categoryTable.id, name: categoryTable.name, slug: categoryTable.slug, parentId: categoryTable.parentId })
          .from(categoryTable)
          .then((rows) => rows),
      ]);

    return {
      ...post,
      category: {
        ...category,
        ancestors: this.buildAncestors(category.id, allCategories),
      },
      tags: postTags,
      totalPageviews,
      commentCount,
    };
  }
}
