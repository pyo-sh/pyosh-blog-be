import { eq, and, isNull, sql } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import type { CommentDetail, CommentAuthor } from "./comment.schema";
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
   * 게시글의 댓글 목록 조회 (계층 구조)
   *
   * @param postId 게시글 ID
   * @param options 조회 옵션 (viewerUserId, viewerIsAdmin)
   * @returns 댓글 목록 (계층 구조)
   */
  async getCommentsByPostId(
    postId: number,
    options?: GetCommentsOptions,
  ): Promise<CommentDetail[]> {
    // 1. 댓글 조회 (active 상태만, 삭제되지 않은 것)
    const comments = await this.db
      .select()
      .from(commentTable)
      .where(
        and(
          eq(commentTable.postId, postId),
          eq(commentTable.status, "active"),
          isNull(commentTable.deletedAt),
        ),
      )
      .orderBy(commentTable.createdAt);

    // 2. 각 댓글에 작성자 정보 보강
    const commentsWithAuthor: CommentWithAuthor[] = await Promise.all(
      comments.map((comment) => this.enrichCommentWithAuthor(comment)),
    );

    // 3. 비밀글 마스킹
    const viewerUserId = options?.viewerUserId ?? null;
    const isAdmin = options?.viewerIsAdmin ?? false;

    const maskedComments = commentsWithAuthor.map((comment) =>
      maskSecretContent(comment, viewerUserId, isAdmin),
    );

    // 4. 계층 구조 변환
    const hierarchicalComments = buildHierarchy(maskedComments);

    // 5. CommentDetail 타입으로 변환 (replies 포함)
    return hierarchicalComments.map((comment) =>
      this.mapToCommentDetail(comment),
    );
  }

  /**
   * 댓글 삭제 (Soft delete)
   *
   * @param commentId 댓글 ID
   * @param author 작성자 정보
   * @param isAdmin 관리자 여부
   */
  async deleteComment(
    commentId: number,
    author: Author | null,
    isAdmin: boolean,
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

    // 3. Soft delete (status='deleted', deletedAt 설정)
    await this.db
      .update(commentTable)
      .set({
        status: "deleted",
        deletedAt: new Date(),
      })
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
        // 사용자를 찾을 수 없으면 기본값
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
   *
   * @param comment 작성자 정보가 포함된 댓글
   * @returns CommentDetail
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
}
