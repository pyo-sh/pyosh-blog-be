import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  GuestbookSettingsResponseSchema,
  UpdateGuestbookSettingsBodySchema,
} from "./settings.schema";
import { SettingsService } from "./settings.service";
import { AdminService } from "@src/routes/auth/admin.service";
import { requireAdmin } from "@src/hooks/auth.hook";

/**
 * Settings 라우트 플러그인 (Public)
 */
export function createSettingsRoute(
  settingsService: SettingsService,
): FastifyPluginAsync {
  const settingsRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance,
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /api/settings/guestbook - 방명록 활성 상태 조회
    typedFastify.get(
      "/guestbook",
      {
        schema: {
          tags: ["settings"],
          summary: "방명록 활성 상태 조회",
          description: "방명록 기능의 활성 상태를 조회합니다.",
          response: {
            200: GuestbookSettingsResponseSchema,
          },
        },
      },
      async (_request, reply) => {
        const enabled = await settingsService.getGuestbookEnabled();
        return reply.status(200).send({ enabled });
      },
    );
  };

  return settingsRoute;
}

/**
 * Admin Settings 라우트 플러그인 (Admin)
 */
export function createAdminSettingsRoute(
  settingsService: SettingsService,
  adminService: AdminService,
): FastifyPluginAsync {
  const adminSettingsRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance,
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // PATCH /api/admin/settings/guestbook - 방명록 활성 상태 변경
    typedFastify.patch(
      "/settings/guestbook",
      {
        schema: {
          tags: ["admin", "settings"],
          summary: "방명록 활성 상태 변경",
          description: "방명록 기능의 활성 상태를 변경합니다.",
          body: UpdateGuestbookSettingsBodySchema,
          response: {
            200: GuestbookSettingsResponseSchema,
          },
        },
        preHandler: requireAdmin(adminService),
      },
      async (request, reply) => {
        const { enabled } = request.body;
        await settingsService.setGuestbookEnabled(enabled);
        return reply.status(200).send({ enabled });
      },
    );
  };

  return adminSettingsRoute;
}
