import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  GuestbookIdParamSchema,
  GuestbookQuerySchema,
  CreateGuestbookOAuthBodySchema,
  CreateGuestbookGuestBodySchema,
  DeleteGuestbookGuestBodySchema,
  GuestbookListResponseSchema,
  GuestbookEntryResponseSchema,
} from "./guestbook.schema";
import { GuestbookService } from "./guestbook.service";
import { User } from "@src/db/schema/users";
import { optionalAuth, requireAdmin } from "@src/hooks/auth.hook";
import { AdminService } from "@src/routes/auth/admin.service";
import { resolveAuthorFromRequest, Author } from "@src/shared/interaction";

/**
 * Guestbook 라우트 플러그인 (Public)
 */
export function createGuestbookRoute(
  guestbookService: GuestbookService,
): FastifyPluginAsync {
  const guestbookRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance & { withTypeProvider: <T>() => FastifyInstance },
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /api/guestbook - 방명록 목록 조회 (Public, 페이지네이션)
    typedFastify.get(
      "/guestbook",
      {
        schema: {
          tags: ["guestbook"],
          summary: "방명록 목록 조회",
          description:
            "방명록 목록을 페이지네이션과 계층 구조로 조회합니다. 비밀글은 작성자와 관리자만 볼 수 있습니다.",
          querystring: GuestbookQuerySchema,
          response: {
            200: GuestbookListResponseSchema,
          },
        },
        preHandler: optionalAuth,
      },
      async (request, reply) => {
        const query = request.query;

        // 현재 사용자 정보 추출
        const viewerUserId = (request.user as User | undefined)?.id ?? null;
        const viewerIsAdmin = Boolean(request.admin);

        const result = await guestbookService.getEntries({
          ...query,
          viewerUserId,
          viewerIsAdmin,
        });

        return reply.status(200).send(result);
      },
    );

    // POST /api/guestbook - 방명록 작성 (OAuth 또는 Guest)
    typedFastify.post(
      "/guestbook",
      {
        schema: {
          tags: ["guestbook"],
          summary: "방명록 작성",
          description:
            "OAuth 로그인 사용자 또는 게스트가 방명록을 작성합니다. 게스트는 이름, 이메일, 비밀번호를 함께 전달해야 합니다.",
          body: z.union([
            CreateGuestbookOAuthBodySchema,
            CreateGuestbookGuestBodySchema,
          ]),
          response: {
            201: GuestbookEntryResponseSchema,
          },
        },
        preHandler: optionalAuth,
      },
      async (request, reply) => {
        let author: Author;
        let input: {
          body: string;
          parentId?: number;
          isSecret?: boolean;
        };

        // OAuth 사용자인지 확인
        if (request.user) {
          // OAuth 사용자
          author = {
            type: "oauth",
            userId: (request.user as User).id,
          };

          const body = CreateGuestbookOAuthBodySchema.parse(request.body);
          input = {
            body: body.body,
            parentId: body.parentId,
            isSecret: body.isSecret,
          };
        } else {
          // 게스트 사용자
          const body = CreateGuestbookGuestBodySchema.parse(request.body);

          author = {
            type: "guest",
            name: body.guestName,
            email: body.guestEmail,
            password: body.guestPassword,
          };

          input = {
            body: body.body,
            parentId: body.parentId,
            isSecret: body.isSecret,
          };
        }

        const entry = await guestbookService.createEntry(input, author);

        return reply.status(201).send({
          data: entry,
        });
      },
    );

    // DELETE /api/guestbook/:id - 방명록 삭제 (본인 또는 게스트 비밀번호)
    typedFastify.delete(
      "/guestbook/:id",
      {
        schema: {
          tags: ["guestbook"],
          summary: "방명록 삭제",
          description:
            "본인이 작성한 방명록을 삭제합니다. 게스트 방명록의 경우 비밀번호를 함께 전달해야 합니다.",
          params: GuestbookIdParamSchema,
          body: DeleteGuestbookGuestBodySchema.optional(),
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
          const body = DeleteGuestbookGuestBodySchema.parse(request.body);
          author = {
            type: "guest",
            name: "", // 삭제 시에는 이름/이메일 불필요
            email: "",
            password: body.guestPassword,
          };
        }

        await guestbookService.deleteEntry(id, author, false);

        return reply.status(204).send();
      },
    );
  };

  return guestbookRoute;
}

/**
 * Guestbook 관리자 라우트 플러그인 (Admin)
 */
export function createAdminGuestbookRoute(
  guestbookService: GuestbookService,
  adminService: AdminService,
): FastifyPluginAsync {
  const adminGuestbookRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance & { withTypeProvider: <T>() => FastifyInstance },
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // DELETE /api/admin/guestbook/:id - 관리자 방명록 강제 삭제
    typedFastify.delete(
      "/guestbook/:id",
      {
        schema: {
          tags: ["admin", "guestbook"],
          summary: "관리자 방명록 삭제",
          description: "관리자가 모든 방명록을 삭제할 수 있습니다.",
          params: GuestbookIdParamSchema,
          response: {
            204: z.void(),
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const { id } = request.params;

        await guestbookService.deleteEntry(id, null, true);

        return reply.status(204).send();
      },
    );
  };

  return adminGuestbookRoute;
}
