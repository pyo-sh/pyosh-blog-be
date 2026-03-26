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
  AdminGuestbookListQuerySchema,
  AdminGuestbookListResponseSchema,
  AdminGuestbookDeleteQuerySchema,
  AdminGuestbookBulkDeleteBodySchema,
  AdminGuestbookBulkPatchBodySchema,
} from "./guestbook.schema";
import { GuestbookService } from "./guestbook.service";
import { SettingsService } from "@src/routes/settings/settings.service";
import { OAuthAccount } from "@src/db/schema/oauth-accounts";
import { optionalAuth, requireAdmin } from "@src/hooks/auth.hook";
import { AdminService } from "@src/routes/auth/admin.service";
import { resolveAuthorFromRequest, Author } from "@src/shared/interaction";
import { HttpError } from "@src/errors/http-error";

/**
 * Guestbook 라우트 플러그인 (Public)
 */
export function createGuestbookRoute(
  guestbookService: GuestbookService,
  settingsService: SettingsService,
): FastifyPluginAsync {
  const guestbookRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance,
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
        const viewerUserId =
          (request.user as OAuthAccount | undefined)?.id ?? null;
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
        config: {
          rateLimit: {
            max: 10,
            timeWindow: "1 minute",
          },
        },
        onRequest: fastify.csrfProtection,
        schema: {
          tags: ["guestbook"],
          summary: "방명록 작성",
          description:
            "OAuth 로그인 사용자 또는 게스트가 방명록을 작성합니다. 게스트는 이름, 이메일, 비밀번호를 함께 전달해야 합니다.",
          body: z.union([
            CreateGuestbookGuestBodySchema,
            CreateGuestbookOAuthBodySchema,
          ]),
          response: {
            201: GuestbookEntryResponseSchema,
          },
        },
        preHandler: optionalAuth,
      },
      async (request, reply) => {
        // 방명록 활성 상태 확인
        const enabled = await settingsService.getGuestbookEnabled();
        if (!enabled) {
          throw HttpError.forbidden("Guestbook is currently disabled.");
        }

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
            userId: (request.user as OAuthAccount).id,
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
        onRequest: fastify.csrfProtection,
        schema: {
          tags: ["guestbook"],
          summary: "방명록 삭제",
          description:
            "본인이 작성한 방명록을 삭제합니다. 게스트 방명록의 경우 비밀번호를 함께 전달해야 합니다.",
          params: GuestbookIdParamSchema,
          body: DeleteGuestbookGuestBodySchema.nullish(),
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
    fastify: FastifyInstance,
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /api/admin/guestbook - 관리자 방명록 목록 조회
    typedFastify.get(
      "/guestbook",
      {
        schema: {
          tags: ["admin", "guestbook"],
          summary: "관리자 방명록 목록 조회",
          description:
            "전체 방명록 목록을 페이지네이션과 필터로 조회합니다. 비밀글 마스킹 없이 모든 내용을 반환합니다.",
          querystring: AdminGuestbookListQuerySchema,
          response: {
            200: AdminGuestbookListResponseSchema,
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const query = request.query;
        const result = await guestbookService.getAdminGuestbook(query);
        return reply.status(200).send(result);
      },
    );

    // DELETE /api/admin/guestbook/bulk - 관리자 방명록 벌크 삭제 (비가역: soft_delete | hard_delete)
    typedFastify.delete(
      "/guestbook/bulk",
      {
        schema: {
          tags: ["admin", "guestbook"],
          summary: "관리자 방명록 벌크 삭제",
          description:
            "방명록을 비가역적으로 삭제합니다. hide/restore는 PATCH /api/admin/guestbook/bulk를 사용하세요.",
          body: AdminGuestbookBulkDeleteBodySchema,
          response: {
            204: z.void(),
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const { ids, action } = request.body;
        await guestbookService.bulkDeleteEntries(ids, action);
        return reply.status(204).send();
      },
    );

    // PATCH /api/admin/guestbook/bulk - 관리자 방명록 벌크 상태 변경 (가역: hide | restore)
    typedFastify.patch(
      "/guestbook/bulk",
      {
        schema: {
          tags: ["admin", "guestbook"],
          summary: "관리자 방명록 벌크 상태 변경",
          description:
            "방명록 상태를 가역적으로 변경합니다. hide: 공개 목록에서 숨김, restore: active 복원.",
          body: AdminGuestbookBulkPatchBodySchema,
          response: {
            204: z.void(),
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const { ids, action } = request.body;
        await guestbookService.bulkPatchEntries(ids, action);
        return reply.status(204).send();
      },
    );

    // DELETE /api/admin/guestbook/:id - 관리자 방명록 삭제 (액션 기반)
    typedFastify.delete(
      "/guestbook/:id",
      {
        schema: {
          tags: ["admin", "guestbook"],
          summary: "관리자 방명록 삭제",
          description:
            "관리자가 방명록을 삭제합니다. action 쿼리로 hide | soft_delete | hard_delete를 지정합니다.",
          params: GuestbookIdParamSchema,
          querystring: AdminGuestbookDeleteQuerySchema,
          response: {
            204: z.void(),
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const { id } = request.params;
        const { action } = request.query;
        await guestbookService.adminDeleteEntry(id, action);
        return reply.status(204).send();
      },
    );
  };

  return adminGuestbookRoute;
}
