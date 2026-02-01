import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import { assetTable } from "@src/db/schema/assets";
import { categoryTable } from "@src/db/schema/categories";
import * as schema from "@src/db/schema/index";
import { postTagTable } from "@src/db/schema/post-tags";
import { Post, postTable, NewPost } from "@src/db/schema/posts";
import { tagTable } from "@src/db/schema/tags";
import { HttpError } from "@src/errors/http-error";
import { TagService } from "@src/services/tag.service";
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
  thumbnailAssetId?: number;
  visibility?: "public" | "private";
  status?: "draft" | "published" | "archived";
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
  thumbnailAssetId?: number;
  visibility?: "public" | "private";
  status?: "draft" | "published" | "archived";
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
  tagId?: number;
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
 * 카테고리 정보
 */
interface PostCategory {
  id: number;
  name: string;
  slug: string;
}

/**
 * 썸네일 정보
 */
interface PostThumbnail {
  id: number;
  url: string;
  storageKey: string;
}

/**
 * 게시글 상세 정보 (관계 포함)
 */
export interface PostDetail extends Post {
  category: PostCategory;
  tags: PostTag[];
  thumbnail: PostThumbnail | null;
}

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
        thumbnailAssetId: input.thumbnailAssetId,
        visibility: input.visibility ?? "public",
        status: input.status ?? "draft",
        publishedAt,
      };

      const [result] = await tx.insert(postTable).values(newPost);
      const postId = result.insertId;

      // 4. 태그 연결
      if (input.tags && input.tags.length > 0) {
        const tagIds = await this.tagService.getOrCreateTags(input.tags);
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
    return await this.db.transaction(async (tx) => {
      // 1. 게시글 존재 확인
      const existing = await tx
        .select()
        .from(postTable)
        .where(eq(postTable.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw HttpError.notFound("게시글을 찾을 수 없습니다");
      }

      // 2. 게시글 수정
      const updateData: Partial<NewPost> = {
        ...input,
        updatedAt: new Date(),
      };

      await tx.update(postTable).set(updateData).where(eq(postTable.id, id));

      // 3. 태그 갱신 (undefined vs 빈 배열 구분)
      if (input.tags !== undefined) {
        // 기존 태그 연결 삭제
        await tx.delete(postTagTable).where(eq(postTagTable.postId, id));

        // 새 태그 연결
        if (input.tags.length > 0) {
          const tagIds = await this.tagService.getOrCreateTags(input.tags);
          await tx
            .insert(postTagTable)
            .values(tagIds.map((tagId) => ({ postId: id, tagId })));
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

    // tag 필터 (post_tag_tb JOIN 필요)
    let tagFilteredPostIds: number[] | undefined;
    if (query.tagId) {
      const postTags = await this.db
        .select({ postId: postTagTable.postId })
        .from(postTagTable)
        .where(eq(postTagTable.tagId, query.tagId));

      tagFilteredPostIds = postTags.map((pt) => pt.postId);

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

    // 각 post에 category, tags 정보 추가
    const postsWithDetails = await Promise.all(
      posts.map((post) => this.enrichPostWithDetails(post)),
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
          sql`${postTable.publishedAt} < ${post.publishedAt}`,
          eq(postTable.status, "published"),
          isNull(postTable.deletedAt),
        ),
      )
      .orderBy(sql`${postTable.publishedAt} DESC`)
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
          sql`${postTable.publishedAt} > ${post.publishedAt}`,
          eq(postTable.status, "published"),
          isNull(postTable.deletedAt),
        ),
      )
      .orderBy(sql`${postTable.publishedAt} ASC`)
      .limit(1);

    return {
      post: postDetail,
      prevPost: prevPosts[0] ?? null,
      nextPost: nextPosts[0] ?? null,
    };
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
        throw HttpError.notFound("게시글을 찾을 수 없습니다");
      }

      // 2. post_tag_tb 연결 삭제
      await tx.delete(postTagTable).where(eq(postTagTable.postId, id));

      // 3. post_tb 레코드 삭제
      await tx.delete(postTable).where(eq(postTable.id, id));
    });
  }

  /**
   * 게시글에 category, tags, thumbnail 정보 추가 (내부 헬퍼)
   */
  private async enrichPostWithDetails(post: Post): Promise<PostDetail> {
    // 1. 카테고리 조회
    const [category] = await this.db
      .select({
        id: categoryTable.id,
        name: categoryTable.name,
        slug: categoryTable.slug,
      })
      .from(categoryTable)
      .where(eq(categoryTable.id, post.categoryId))
      .limit(1);

    // 2. 태그 조회
    const postTags = await this.db
      .select({
        id: tagTable.id,
        name: tagTable.name,
        slug: tagTable.slug,
      })
      .from(postTagTable)
      .innerJoin(tagTable, eq(postTagTable.tagId, tagTable.id))
      .where(eq(postTagTable.postId, post.id));

    // 3. 썸네일 조회
    let thumbnail: PostThumbnail | null = null;
    if (post.thumbnailAssetId) {
      const [asset] = await this.db
        .select({
          id: assetTable.id,
          storageKey: assetTable.storageKey,
        })
        .from(assetTable)
        .where(eq(assetTable.id, post.thumbnailAssetId))
        .limit(1);

      if (asset) {
        thumbnail = {
          id: asset.id,
          url: `/uploads/${asset.storageKey}`,
          storageKey: asset.storageKey,
        };
      }
    }

    return {
      ...post,
      category,
      tags: postTags,
      thumbnail,
    };
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

    // category, tags, thumbnail 정보 조회 (트랜잭션 컨텍스트 사용)
    const [category] = await tx
      .select({
        id: categoryTable.id,
        name: categoryTable.name,
        slug: categoryTable.slug,
      })
      .from(categoryTable)
      .where(eq(categoryTable.id, post.categoryId))
      .limit(1);

    const postTags = await tx
      .select({
        id: tagTable.id,
        name: tagTable.name,
        slug: tagTable.slug,
      })
      .from(postTagTable)
      .innerJoin(tagTable, eq(postTagTable.tagId, tagTable.id))
      .where(eq(postTagTable.postId, post.id));

    let thumbnail: PostThumbnail | null = null;
    if (post.thumbnailAssetId) {
      const [asset] = await tx
        .select({
          id: assetTable.id,
          storageKey: assetTable.storageKey,
        })
        .from(assetTable)
        .where(eq(assetTable.id, post.thumbnailAssetId))
        .limit(1);

      if (asset) {
        thumbnail = {
          id: asset.id,
          url: `/uploads/${asset.storageKey}`,
          storageKey: asset.storageKey,
        };
      }
    }

    return {
      ...post,
      category,
      tags: postTags,
      thumbnail,
    };
  }
}
