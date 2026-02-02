import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  PostIdParamSchema,
  CommentIdParamSchema,
  CreateCommentOAuthBodySchema,
  CreateCommentGuestBodySchema,
  DeleteCommentGuestBodySchema,
  CommentsResponseSchema,
  CommentResponseSchema,
} from "./comment.schema";
import { CommentService } from "./comment.service";
import { User } from "@src/db/schema/users";
import { optionalAuth, requireAdmin } from "@src/hooks/auth.hook";
import { AdminService } from "@src/routes/auth/admin.service";
import { resolveAuthorFromRequest, Author } from "@src/shared/interaction";

/**
 * Comment 라우트 플러그인 (Public)
 */
export function createCommentRoute(
  commentService: CommentService,
): FastifyPluginAsync {
  const commentRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance & { withTypeProvider: <T>() => FastifyInstance },
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /api/posts/:postId/comments - 댓글 목록 조회 (Public)
    typedFastify.get(
      "/posts/:postId/comments",
      {
        schema: {
          tags: ["comments"],
          summary: "게시글 댓글 조회",
          description:
            "게시글의 댓글 목록을 계층 구조로 조회합니다. 비밀 댓글은 작성자와 관리자만 볼 수 있습니다.",
          params: PostIdParamSchema,
          response: {
            200: CommentsResponseSchema,
          },
        },
        preHandler: optionalAuth,
      },
      async (request, reply) => {
        const { postId } = request.params;

        // 현재 사용자 정보 추출
        const viewerUserId = (request.user as User | undefined)?.id ?? null;
        const viewerIsAdmin = Boolean(request.admin);

        const comments = await commentService.getCommentsByPostId(postId, {
          viewerUserId,
          viewerIsAdmin,
        });

        return reply.status(200).send({
          data: comments,
        });
      },
    );

    // POST /api/posts/:postId/comments - 댓글 작성 (OAuth 또는 Guest)
    typedFastify.post(
      "/posts/:postId/comments",
      {
        schema: {
          tags: ["comments"],
          summary: "댓글 작성",
          description:
            "OAuth 로그인 사용자 또는 게스트가 댓글을 작성합니다. 게스트는 이름, 이메일, 비밀번호를 함께 전달해야 합니다.",
          params: PostIdParamSchema,
          body: z.union([
            CreateCommentOAuthBodySchema,
            CreateCommentGuestBodySchema,
          ]),
          response: {
            201: CommentResponseSchema,
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

        // OAuth 사용자인지 확인
        if (request.user) {
          // OAuth 사용자
          author = {
            type: "oauth",
            userId: (request.user as User).id,
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

        const comment = await commentService.createComment(
          postId,
          input,
          author,
        );

        return reply.status(201).send({
          data: comment,
        });
      },
    );

    // DELETE /api/comments/:id - 댓글 삭제 (본인 또는 게스트 비밀번호)
    typedFastify.delete(
      "/comments/:id",
      {
        schema: {
          tags: ["comments"],
          summary: "댓글 삭제",
          description:
            "본인이 작성한 댓글을 삭제합니다. 게스트 댓글의 경우 비밀번호를 함께 전달해야 합니다.",
          params: CommentIdParamSchema,
          body: DeleteCommentGuestBodySchema.optional(),
          response: {
            204: z.void(),
          },
        },
        preHandler: optionalAuth,
      },
      async (request, reply) => {
        const { id } = request.params;

        let author: Author | null = resolveAuthorFromRequest(request);

        // OAuth 사용자가 아니고, body에 guestPassword가 있으면 게스트 사용자로 처리
        if (!author && request.body) {
          const body = DeleteCommentGuestBodySchema.parse(request.body);
          author = {
            type: "guest",
            name: "", // 삭제 시에는 이름/이메일 불필요
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
    fastify: FastifyInstance & { withTypeProvider: <T>() => FastifyInstance },
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // DELETE /api/admin/comments/:id - 관리자 댓글 강제 삭제
    typedFastify.delete(
      "/comments/:id",
      {
        schema: {
          tags: ["admin", "comments"],
          summary: "관리자 댓글 삭제",
          description: "관리자가 모든 댓글을 삭제할 수 있습니다.",
          params: CommentIdParamSchema,
          response: {
            204: z.void(),
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const { id } = request.params;

        await commentService.deleteComment(id, null, true);

        return reply.status(204).send();
      },
    );
  };

  return adminCommentRoute;
}
