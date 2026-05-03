import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  PostIdParamSchema,
  CommentIdParamSchema,
  CommentsQuerySchema,
  CreateCommentOAuthBodySchema,
  CreateCommentGuestBodySchema,
  DeleteCommentGuestBodySchema,
  RevealCommentBodySchema,
  CommentsResponseSchema,
  CommentResponseSchema,
  CreateCommentResponseSchema,
  AdminCommentListQuerySchema,
  AdminCommentListResponseSchema,
  AdminCommentThreadResponseSchema,
  AdminCommentDeleteQuerySchema,
  AdminCommentRestoreResponseSchema,
  AdminCommentHideResponseSchema,
  AdminCommentBulkBodySchema,
} from "./comment.schema";
import { CommentService } from "./comment.service";
import { OAuthAccount } from "@src/db/schema/oauth-accounts";
import { optionalAuth, requireAdmin } from "@src/hooks/auth.hook";
import { AdminService } from "@src/routes/auth/admin.service";
import { ErrorResponseSchema } from "@src/schemas/common";
import { resolveAuthorFromRequest, Author } from "@src/shared/interaction";

/**
 * Comment 라우트 플러그인 (Public)
 */
export function createCommentRoute(
  commentService: CommentService,
): FastifyPluginAsync {
  const commentRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /posts/:postId/comments - 댓글 목록 조회 (Public, 페이지네이션)
    typedFastify.get(
      "/posts/:postId/comments",
      {
        schema: {
          tags: ["comments"],
          summary: "게시글 댓글 조회",
          description:
            "게시글의 댓글 목록을 계층 구조로 조회합니다. 페이지네이션은 루트 댓글 기준이며, 비밀 댓글은 작성자와 관리자만 볼 수 있습니다.",
          params: PostIdParamSchema,
          querystring: CommentsQuerySchema,
          response: {
            200: CommentsResponseSchema,
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
        preHandler: optionalAuth,
      },
      async (request, reply) => {
        const { postId } = request.params;
        const { page, limit } = request.query;

        const viewerUserId =
          (request.user as OAuthAccount | undefined)?.id ?? null;
        const viewerIsAdmin = Boolean(request.admin);

        const result = await commentService.getCommentsByPostId(
          postId,
          page,
          limit,
          { viewerUserId, viewerIsAdmin },
        );

        return reply.status(200).send(result);
      },
    );

    // POST /posts/:postId/comments - 댓글 작성 (OAuth 또는 Guest)
    typedFastify.post(
      "/posts/:postId/comments",
      {
        config: {
          rateLimit: {
            max: 10,
            timeWindow: "1 minute",
          },
        },
        onRequest: fastify.csrfProtection,
        schema: {
          tags: ["comments"],
          summary: "댓글 작성",
          description:
            "OAuth 로그인 사용자 또는 게스트가 댓글을 작성합니다. 게스트는 이름과 비밀번호를 전달해야 하며, 비밀 댓글이면 복원 토큰이 함께 발급됩니다.\n\n" +
            "**CSRF 토큰 필요**: `GET /auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.\n\n" +
            "**Rate limit**: 10회/분",
          params: PostIdParamSchema,
          body: z.union([
            CreateCommentGuestBodySchema,
            CreateCommentOAuthBodySchema,
          ]),
          response: {
            201: CreateCommentResponseSchema,
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
            429: ErrorResponseSchema,
          },
        },
        preHandler: optionalAuth,
      },
      async (request, reply) => {
        const { postId } = request.params;

        let author: Author;
        let input: {
          body: string;
          parentId?: number;
          replyToCommentId?: number;
          isSecret?: boolean;
        };

        if (request.user) {
          // OAuth 사용자
          author = {
            type: "oauth",
            userId: (request.user as OAuthAccount).id,
          };

          const body = CreateCommentOAuthBodySchema.parse(request.body);
          input = {
            body: body.body,
            parentId: body.parentId,
            replyToCommentId: body.replyToCommentId,
            isSecret: body.isSecret,
          };
        } else {
          // 게스트 사용자
          const body = CreateCommentGuestBodySchema.parse(request.body);

          author = {
            type: "guest",
            name: body.guestName,
            email: body.guestEmail,
            password: body.guestPassword,
          };

          input = {
            body: body.body,
            parentId: body.parentId,
            replyToCommentId: body.replyToCommentId,
            isSecret: body.isSecret,
          };
        }

        const result = await commentService.createComment(
          postId,
          input,
          author,
        );

        return reply.status(201).send({
          data: result.comment,
          revealToken: result.revealToken,
        });
      },
    );

    typedFastify.post(
      "/comments/:id/reveal",
      {
        schema: {
          tags: ["comments"],
          summary: "비밀 댓글 원문 복원",
          description:
            "게스트 비밀 댓글 작성 직후 받은 복원 토큰으로 해당 댓글의 원문을 다시 조회합니다.",
          params: CommentIdParamSchema,
          body: RevealCommentBodySchema,
          response: {
            200: CommentResponseSchema,
            400: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const { revealToken } = request.body;

        const comment = await commentService.revealSecretComment(
          id,
          revealToken,
        );

        return reply.status(200).send({ data: comment });
      },
    );

    // DELETE /comments/:id - 댓글 삭제 (본인 또는 게스트 비밀번호)
    typedFastify.delete(
      "/comments/:id",
      {
        onRequest: fastify.csrfProtection,
        schema: {
          tags: ["comments"],
          summary: "댓글 삭제",
          description:
            "본인이 작성한 댓글을 삭제합니다. 게스트 댓글의 경우 비밀번호를 함께 전달해야 합니다.\n\n" +
            "**CSRF 토큰 필요**: `GET /auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          params: CommentIdParamSchema,
          body: DeleteCommentGuestBodySchema.nullish(),
          response: {
            204: z.void(),
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
        preHandler: optionalAuth,
      },
      async (request, reply) => {
        const { id } = request.params;

        let author: Author | null = resolveAuthorFromRequest(request);

        if (!author && request.body) {
          const body = DeleteCommentGuestBodySchema.parse(request.body);
          author = {
            type: "guest",
            name: "",
            email: "",
            password: body.guestPassword,
          };
        }

        await commentService.deleteComment(id, author, false);

        return reply.status(204).send();
      },
    );
  };

  return commentRoute;
}

/**
 * Comment 관리자 라우트 플러그인 (Admin)
 */
export function createAdminCommentRoute(
  commentService: CommentService,
  adminService: AdminService,
): FastifyPluginAsync {
  const adminCommentRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance,
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /admin/comments - 관리자 댓글 목록 조회
    typedFastify.get(
      "/comments",
      {
        schema: {
          tags: ["admin", "comments"],
          summary: "관리자 댓글 목록 조회",
          description:
            "전체 댓글 목록을 페이지네이션과 필터로 조회합니다. 비밀글 마스킹 없이 모든 내용을 반환합니다.",
          security: [{ cookieAuth: [] }],
          querystring: AdminCommentListQuerySchema,
          response: {
            200: AdminCommentListResponseSchema,
            400: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const query = request.query;
        const result = await commentService.getAdminComments(query);

        return reply.status(200).send(result);
      },
    );

    // GET /admin/comments/:id/thread - 스레드 조회 (부모 + 모든 답글)
    typedFastify.get(
      "/comments/:id/thread",
      {
        schema: {
          tags: ["admin", "comments"],
          summary: "관리자 댓글 스레드 조회",
          description: "부모 댓글과 모든 답글을 반환합니다.",
          security: [{ cookieAuth: [] }],
          params: CommentIdParamSchema,
          response: {
            200: AdminCommentThreadResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const { id } = request.params;
        const result = await commentService.getAdminCommentThread(id);

        return reply.status(200).send(result);
      },
    );

    // PUT /admin/comments/:id/hide - 댓글 숨김 (active → hidden)
    typedFastify.put(
      "/comments/:id/hide",
      {
        onRequest: fastify.csrfProtection,
        schema: {
          tags: ["admin", "comments"],
          summary: "관리자 댓글 숨김",
          description:
            "active 상태 댓글을 hidden 상태로 전환합니다. deleted 또는 hidden 상태 댓글은 400을 반환합니다.\n\n" +
            "**CSRF 토큰 필요**: `GET /auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          params: CommentIdParamSchema,
          response: {
            200: AdminCommentHideResponseSchema,
            400: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const { id } = request.params;
        await commentService.hideComment(id);

        return reply.status(200).send({ success: true as const });
      },
    );

    // PUT /admin/comments/:id/restore - 댓글 복원 (deleted | hidden → active)
    typedFastify.put(
      "/comments/:id/restore",
      {
        schema: {
          tags: ["admin", "comments"],
          summary: "관리자 댓글 복원",
          description:
            "deleted 또는 hidden 상태 댓글을 active 상태로 복원합니다. active 상태 댓글은 400을 반환합니다.\n\n" +
            "**CSRF 토큰 필요**: `GET /auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          params: CommentIdParamSchema,
          response: {
            200: AdminCommentRestoreResponseSchema,
            400: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const { id } = request.params;
        await commentService.restoreComment(id);

        return reply.status(200).send({ success: true as const });
      },
    );

    // DELETE /admin/comments/bulk - 벌크 삭제/복원
    // Static path '/bulk' takes priority over '/:id' in find-my-way; ordering is for readability only.
    typedFastify.delete(
      "/comments/bulk",
      {
        onRequest: fastify.csrfProtection,
        schema: {
          tags: ["admin", "comments"],
          summary: "관리자 댓글 벌크 작업",
          description:
            "여러 댓글을 한 번에 숨김, 복원, 소프트 삭제, 또는 하드 삭제합니다. hide는 active 상태만 hidden으로 전환하고, restore는 deleted 또는 hidden 상태를 active로 복원합니다.\n\n" +
            "**CSRF 토큰 필요**: `GET /auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          body: AdminCommentBulkBodySchema,
          response: {
            204: z.void(),
            400: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const { ids, action } = request.body;
        await commentService.bulkOperateComments(ids, action);

        return reply.status(204).send();
      },
    );

    // DELETE /admin/comments/:id - 관리자 댓글 삭제 (soft/hard)
    typedFastify.delete(
      "/comments/:id",
      {
        schema: {
          tags: ["admin", "comments"],
          summary: "관리자 댓글 삭제",
          description:
            "관리자가 댓글을 삭제합니다. ?action=soft_delete(기본) 또는 ?action=hard_delete.\n\n" +
            "**CSRF 토큰 필요**: `GET /auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          params: CommentIdParamSchema,
          querystring: AdminCommentDeleteQuerySchema,
          response: {
            204: z.void(),
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const { id } = request.params;
        const { action } = request.query;

        await commentService.deleteComment(
          id,
          null,
          true,
          action === "hard_delete",
        );

        return reply.status(204).send();
      },
    );
  };

  return adminCommentRoute;
}
