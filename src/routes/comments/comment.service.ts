import { eq, and, isNull, sql, gte, lte, asc, desc, inArray } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import type {
  CommentDetail,
  CommentAuthor,
  AdminCommentItem,
  AdminCommentListQuery,
} from "./comment.schema";
import { Comment, commentTable, NewComment } from "@src/db/schema/comments";
import * as schema from "@src/db/schema/index";
import { postTable } from "@src/db/schema/posts";
import { oauthAccountTable } from "@src/db/schema/oauth-accounts";
import { HttpError } from "@src/errors/http-error";
import {
  Author,
  buildHierarchy,
  maskSecretContent,
  verifyDeletePermission,
  HierarchicalItem,
  SecretItem,
} from "@src/shared/interaction";
import { hashPassword } from "@src/shared/password";
import {
  buildPaginatedResponse,
  calculateOffset,
  calculateTotalPages,
  PaginatedResponse,
} from "@src/shared/pagination";

/**
 * 댓글 작성 입력 데이터
 */
export interface CreateCommentInput {
  body: string;
  parentId?: number;
  replyToCommentId?: number;
  isSecret?: boolean;
}

/**
 * 댓글 조회 옵션
 */
export interface GetCommentsOptions {
  viewerUserId?: number | null;
  viewerIsAdmin?: boolean;
}

/**
 * Public 댓글 목록 페이지네이션 결과
 */
export interface CommentListResult {
  data: CommentDetail[];
  meta: {
    page: number;
    limit: number;
    totalCount: number;
    totalRootComments: number;
    totalPages: number;
  };
}

/**
 * 내부 댓글 타입 (계층 구조 + 비밀글 속성)
 */
interface CommentWithAuthor extends Comment, HierarchicalItem, SecretItem {
  author: CommentAuthor;
  children?: CommentWithAuthor[];
}

/**
 * Comment Service
 */
export class CommentService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * 댓글 작성 (트랜잭션)
   *
   * @param postId 게시글 ID
   * @param input 댓글 입력 데이터
   * @param author 작성자 정보 (OAuth 또는 Guest)
   * @returns 생성된 댓글 상세 정보
   */
  async createComment(
    postId: number,
    input: CreateCommentInput,
    author: Author,
  ): Promise<CommentDetail> {
    return await this.db.transaction(async (tx) => {
      // 1. 게시글 존재 확인 (삭제되지 않은 것)
      const [post] = await tx
        .select()
        .from(postTable)
        .where(and(eq(postTable.id, postId), isNull(postTable.deletedAt)))
        .limit(1);

      if (!post) {
        throw HttpError.notFound("Post not found.");
      }

      // 2. parentId가 있으면 부모 댓글 검증
      let depth = 0;
      if (input.parentId) {
        const [parent] = await tx
          .select()
          .from(commentTable)
          .where(eq(commentTable.id, input.parentId))
          .limit(1);

        if (!parent) {
          throw HttpError.notFound("Parent comment not found.");
        }

        // 같은 게시글의 댓글인지 확인
        if (parent.postId !== postId) {
          throw HttpError.badRequest(
            "Parent comment belongs to a different post.",
          );
        }

        // depth 확인 (부모가 depth 1이면 대댓글 불가)
        if (parent.depth >= 1) {
          throw HttpError.badRequest(
            "Replies can only be nested one level deep.",
          );
        }

        depth = parent.depth + 1;
      }

      // 3. replyToCommentId가 있으면 대상 댓글 확인 및 이름 추출
      let replyToName: string | null = null;
      if (input.replyToCommentId) {
        const [replyTo] = await tx
          .select()
          .from(commentTable)
          .where(eq(commentTable.id, input.replyToCommentId))
          .limit(1);

        if (!replyTo) {
          throw HttpError.notFound("Reply target comment not found.");
        }

        // 같은 게시글의 댓글인지 확인
        if (replyTo.postId !== postId) {
          throw HttpError.badRequest(
            "Reply target comment belongs to a different post.",
          );
        }

        // 이름 추출 (OAuth: user join, Guest: guestName)
        if (replyTo.authorType === "oauth" && replyTo.oauthAccountId) {
          const [account] = await tx
            .select({ name: oauthAccountTable.displayName })
            .from(oauthAccountTable)
            .where(eq(oauthAccountTable.id, replyTo.oauthAccountId))
            .limit(1);

          replyToName = account?.name ?? "알 수 없음";
        } else if (replyTo.authorType === "guest") {
          replyToName = replyTo.guestName ?? "익명";
        }
      }

      // 4. author 분기하여 댓글 데이터 생성
      let newComment: NewComment;

      if (author.type === "oauth") {
        newComment = {
          postId,
          parentId: input.parentId ?? null,
          depth,
          replyToCommentId: input.replyToCommentId ?? null,
          replyToName,
          authorType: "oauth",
          oauthAccountId: author.userId,
          guestName: null,
          guestEmail: null,
          guestPasswordHash: null,
          body: input.body,
          isSecret: input.isSecret ?? false,
          status: "active",
        };
      } else {
        // Guest
        const passwordHash = await hashPassword(author.password);

        newComment = {
          postId,
          parentId: input.parentId ?? null,
          depth,
          replyToCommentId: input.replyToCommentId ?? null,
          replyToName,
          authorType: "guest",
          oauthAccountId: null,
          guestName: author.name,
          guestEmail: author.email,
          guestPasswordHash: passwordHash,
          body: input.body,
          isSecret: input.isSecret ?? false,
          status: "active",
        };
      }

      // 5. 댓글 삽입
      const [result] = await tx.insert(commentTable).values(newComment);
      const commentId = result.insertId;

      // 6. 생성된 댓글 조회 및 작성자 정보 보강
      const [comment] = await tx
        .select()
        .from(commentTable)
        .where(eq(commentTable.id, commentId))
        .limit(1);

      if (!comment) {
        throw HttpError.internal("Failed to retrieve comment after creation.");
      }

      // CommentDetail 타입으로 직접 변환
      const enrichedComment = await this.enrichCommentWithAuthor(comment, tx);

      return this.mapToCommentDetail(enrichedComment);
    });
  }

  /**
   * 게시글의 댓글 목록 조회 (계층 구조, 페이지네이션)
   *
   * @param postId 게시글 ID
   * @param page 페이지 번호 (루트 댓글 기준)
   * @param limit 페이지당 루트 댓글 수
   * @param options 조회 옵션 (viewerUserId, viewerIsAdmin)
   * @returns 댓글 목록 (계층 구조) + 페이지네이션 메타
   */
  async getCommentsByPostId(
    postId: number,
    page: number,
    limit: number,
    options?: GetCommentsOptions,
  ): Promise<CommentListResult> {
    const offset = calculateOffset(page, limit);
    const viewerUserId = options?.viewerUserId ?? null;
    const isAdmin = options?.viewerIsAdmin ?? false;

    const activeCondition = and(
      eq(commentTable.postId, postId),
      eq(commentTable.status, "active"),
      isNull(commentTable.deletedAt),
    );

    // 1. 루트 댓글 수 + 전체 댓글 수 병렬 조회
    const [rootCountResult, totalCountResult] = await Promise.all([
      this.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(commentTable)
        .where(and(activeCondition, isNull(commentTable.parentId))),
      this.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(commentTable)
        .where(activeCondition),
    ]);

    const totalRootComments = rootCountResult[0]?.count ?? 0;
    const totalCount = totalCountResult[0]?.count ?? 0;
    const totalPages = calculateTotalPages(totalRootComments, limit);

    // 2. 페이지네이션된 루트 댓글 조회
    const rootComments = await this.db
      .select()
      .from(commentTable)
      .where(and(activeCondition, isNull(commentTable.parentId)))
      .orderBy(asc(commentTable.createdAt))
      .limit(limit)
      .offset(offset);

    if (rootComments.length === 0) {
      return {
        data: [],
        meta: { page, limit, totalCount, totalRootComments, totalPages },
      };
    }

    // 3. 루트 댓글의 replies 조회
    const rootIds = rootComments.map((c) => c.id);
    const replies = await this.db
      .select()
      .from(commentTable)
      .where(
        and(
          eq(commentTable.postId, postId),
          eq(commentTable.status, "active"),
          isNull(commentTable.deletedAt),
          inArray(commentTable.parentId, rootIds),
        ),
      )
      .orderBy(asc(commentTable.createdAt));

    // 4. 작성자 정보 보강
    const allComments = [...rootComments, ...replies];
    const commentsWithAuthor: CommentWithAuthor[] = await Promise.all(
      allComments.map((comment) => this.enrichCommentWithAuthor(comment)),
    );

    // 5. 비밀글 마스킹
    const maskedComments = commentsWithAuthor.map((comment) =>
      maskSecretContent(comment, viewerUserId, isAdmin),
    );

    // 6. 계층 구조 변환 (루트만 반환, replies는 각 루트의 children에 포함)
    const hierarchicalComments = buildHierarchy(maskedComments);

    return {
      data: hierarchicalComments.map((comment) =>
        this.mapToCommentDetail(comment),
      ),
      meta: { page, limit, totalCount, totalRootComments, totalPages },
    };
  }

  /**
   * 댓글 삭제 (Soft delete 또는 Hard delete)
   *
   * @param commentId 댓글 ID
   * @param author 작성자 정보
   * @param isAdmin 관리자 여부
   * @param hardDelete Hard delete 여부 (관리자 전용)
   */
  async deleteComment(
    commentId: number,
    author: Author | null,
    isAdmin: boolean,
    hardDelete = false,
  ): Promise<void> {
    // 1. 댓글 존재 확인
    const [comment] = await this.db
      .select()
      .from(commentTable)
      .where(eq(commentTable.id, commentId))
      .limit(1);

    if (!comment) {
      throw HttpError.notFound("Comment not found.");
    }

    // 2. 삭제 권한 확인
    await verifyDeletePermission(comment, author, isAdmin);

    if (hardDelete && isAdmin) {
      // Hard delete: 자식 댓글 cascade 삭제 후 본 댓글 삭제 (atomic)
      await this.db.transaction(async (tx) => {
        await tx
          .delete(commentTable)
          .where(eq(commentTable.parentId, commentId));
        await tx
          .delete(commentTable)
          .where(eq(commentTable.id, commentId));
      });
    } else {
      // Soft delete (status='deleted', deletedAt 설정)
      await this.db
        .update(commentTable)
        .set({
          status: "deleted",
          deletedAt: new Date(),
        })
        .where(eq(commentTable.id, commentId));
    }
  }

  /**
   * 댓글 복원 (deleted → active)
   *
   * @param commentId 댓글 ID
   */
  async restoreComment(commentId: number): Promise<void> {
    const [comment] = await this.db
      .select()
      .from(commentTable)
      .where(eq(commentTable.id, commentId))
      .limit(1);

    if (!comment) {
      throw HttpError.notFound("Comment not found.");
    }

    if (comment.status !== "deleted") {
      throw HttpError.badRequest("Comment is not deleted.");
    }

    await this.db
      .update(commentTable)
      .set({ status: "active", deletedAt: null })
      .where(eq(commentTable.id, commentId));
  }

  /**
   * 게시글의 댓글 수 조회
   *
   * @param postId 게시글 ID
   * @returns 댓글 수 (active 상태만)
   */
  async getCommentCount(postId: number): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(commentTable)
      .where(
        and(
          eq(commentTable.postId, postId),
          eq(commentTable.status, "active"),
          isNull(commentTable.deletedAt),
        ),
      );

    return result?.count ?? 0;
  }

  /**
   * 관리자용 전체 댓글 목록 조회 (페이지네이션 + 필터)
   *
   * @param query 쿼리 파라미터
   * @returns 페이지네이션된 댓글 목록 (비밀글 마스킹 없음, post.title 포함)
   */
  async getAdminComments(
    query: AdminCommentListQuery,
  ): Promise<PaginatedResponse<AdminCommentItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = calculateOffset(page, limit);
    const order = query.order ?? "desc";

    const conditions = [];
    if (query.postId !== undefined) {
      conditions.push(eq(commentTable.postId, query.postId));
    }
    if (query.status !== undefined) {
      conditions.push(eq(commentTable.status, query.status));
    }
    if (query.authorType !== undefined) {
      conditions.push(eq(commentTable.authorType, query.authorType));
    }
    if (query.startDate !== undefined) {
      conditions.push(gte(commentTable.createdAt, new Date(query.startDate)));
    }
    if (query.endDate !== undefined) {
      conditions.push(lte(commentTable.createdAt, new Date(query.endDate)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const orderBy =
      order === "asc"
        ? asc(commentTable.createdAt)
        : desc(commentTable.createdAt);

    const [comments, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(commentTable)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),

      this.db
        .select({ total: sql<number>`COUNT(*)` })
        .from(commentTable)
        .where(where),
    ]);

    // Batch-fetch posts to avoid N+1 queries
    const postIds = [...new Set(comments.map((c) => c.postId))];
    const postRows =
      postIds.length > 0
        ? await this.db
            .select({ id: postTable.id, title: postTable.title })
            .from(postTable)
            .where(inArray(postTable.id, postIds))
        : [];
    const postMap = new Map(postRows.map((p) => [p.id, p]));

    const items: AdminCommentItem[] = await Promise.all(
      comments.map(async (comment) => {
        const enriched = await this.enrichCommentWithAuthor(comment);
        const post = postMap.get(comment.postId) ?? {
          id: comment.postId,
          title: "(삭제된 게시글)",
        };
        return this.mapToAdminCommentItem(enriched, post);
      }),
    );

    return buildPaginatedResponse(items, total, page, limit);
  }

  /**
   * 관리자용 댓글 스레드 조회 (부모 + 모든 답글)
   *
   * @param commentId 댓글 ID
   * @returns 부모 댓글 + 답글 목록
   */
  async getAdminCommentThread(commentId: number): Promise<{
    parent: AdminCommentItem;
    replies: AdminCommentItem[];
  }> {
    const [comment] = await this.db
      .select()
      .from(commentTable)
      .where(eq(commentTable.id, commentId))
      .limit(1);

    if (!comment) {
      throw HttpError.notFound("Comment not found.");
    }

    // 루트 댓글로 정규화 (답글이 전달된 경우 부모로 이동)
    let root = comment;
    if (comment.parentId !== null) {
      const [parent] = await this.db
        .select()
        .from(commentTable)
        .where(eq(commentTable.id, comment.parentId))
        .limit(1);
      if (!parent) {
        throw HttpError.notFound("Root comment not found.");
      }
      root = parent;
    }

    const replies = await this.db
      .select()
      .from(commentTable)
      .where(eq(commentTable.parentId, root.id))
      .orderBy(asc(commentTable.createdAt));

    const post = await this.getPostSummary(root.postId);
    const enrichedRoot = await this.enrichCommentWithAuthor(root);
    const enrichedReplies = await Promise.all(
      replies.map((r) => this.enrichCommentWithAuthor(r)),
    );

    return {
      parent: this.mapToAdminCommentItem(enrichedRoot, post),
      replies: enrichedReplies.map((r) =>
        this.mapToAdminCommentItem(r, post),
      ),
    };
  }

  /**
   * 관리자 벌크 작업 (restore / soft_delete / hard_delete)
   *
   * @param ids 대상 댓글 ID 목록
   * @param action 수행할 작업
   */
  async bulkOperateComments(
    ids: number[],
    action: "restore" | "soft_delete" | "hard_delete",
  ): Promise<void> {
    if (ids.length === 0) return;

    if (action === "restore") {
      await this.db
        .update(commentTable)
        .set({ status: "active", deletedAt: null })
        .where(
          and(
            inArray(commentTable.id, ids),
            eq(commentTable.status, "deleted"),
          ),
        );
    } else if (action === "soft_delete") {
      await this.db
        .update(commentTable)
        .set({ status: "deleted", deletedAt: new Date() })
        .where(inArray(commentTable.id, ids));
    } else {
      // hard_delete: 자식 댓글도 cascade 삭제 (atomic)
      await this.db.transaction(async (tx) => {
        const childRows = await tx
          .select({ id: commentTable.id })
          .from(commentTable)
          .where(inArray(commentTable.parentId, ids));

        const childIds = childRows.map((c) => c.id);
        if (childIds.length > 0) {
          await tx
            .delete(commentTable)
            .where(inArray(commentTable.id, childIds));
        }
        await tx
          .delete(commentTable)
          .where(inArray(commentTable.id, ids));
      });
    }
  }

  /**
   * 게시글 요약 정보 조회 (private)
   */
  private async getPostSummary(
    postId: number,
  ): Promise<{ id: number; title: string }> {
    const [post] = await this.db
      .select({ id: postTable.id, title: postTable.title })
      .from(postTable)
      .where(eq(postTable.id, postId))
      .limit(1);

    return post ?? { id: postId, title: "(삭제된 게시글)" };
  }

  /**
   * 댓글에 작성자 정보 보강 (private)
   *
   * @param comment 댓글
   * @param tx 트랜잭션 (선택)
   * @returns 작성자 정보가 포함된 댓글
   */
  private async enrichCommentWithAuthor(
    comment: Comment,
    tx?: MySql2Database<typeof schema>,
  ): Promise<CommentWithAuthor> {
    const db = tx ?? this.db;

    let author: CommentAuthor;

    if (comment.authorType === "oauth" && comment.oauthAccountId) {
      // OAuth 사용자: oauthAccountTable JOIN
      const [account] = await db
        .select()
        .from(oauthAccountTable)
        .where(eq(oauthAccountTable.id, comment.oauthAccountId))
        .limit(1);

      if (account) {
        const isDeleted = account.deletedAt !== null;
        author = {
          type: "oauth",
          id: isDeleted ? undefined : account.id,
          name: isDeleted ? "탈퇴한 사용자" : account.displayName,
          avatarUrl: isDeleted ? undefined : (account.avatarUrl ?? undefined),
        };
      } else {
        author = {
          type: "oauth",
          name: "알 수 없음",
        };
      }
    } else {
      // Guest 사용자: 댓글 필드 직접 사용
      author = {
        type: "guest",
        name: comment.guestName ?? "익명",
        email: comment.guestEmail ?? undefined,
      };
    }

    return {
      ...comment,
      author,
      children: [],
    };
  }

  /**
   * CommentWithAuthor를 CommentDetail로 변환 (private)
   */
  private mapToCommentDetail(comment: CommentWithAuthor): CommentDetail {
    return {
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      depth: comment.depth,
      body: comment.body,
      isSecret: comment.isSecret,
      status: comment.status as "active" | "deleted",
      author: comment.author,
      replyToName: comment.replyToName,
      replies: (comment.children ?? []).map((child) =>
        this.mapToCommentDetail(child),
      ),
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }

  /**
   * CommentWithAuthor를 AdminCommentItem으로 변환 (private)
   */
  private mapToAdminCommentItem(
    comment: CommentWithAuthor,
    post: { id: number; title: string },
  ): AdminCommentItem {
    return {
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      depth: comment.depth,
      body: comment.body,
      isSecret: comment.isSecret,
      status: comment.status as "active" | "deleted" | "hidden",
      author: comment.author,
      replyToName: comment.replyToName,
      post,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }
}
