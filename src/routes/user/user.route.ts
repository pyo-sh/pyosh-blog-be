import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { UserService } from "./user.service";
import {
  UpdateMyProfileBodySchema,
  UserProfileResponseSchema,
} from "./user.schema";
import { OAuthAccount } from "@src/db/schema/oauth-accounts";
import { requireAuth } from "@src/hooks/auth.hook";

const ErrorResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
});

/**
 * User 라우트 플러그인 (OAuth 인증 필수)
 */
export function createUserRoute(userService: UserService): FastifyPluginAsync {
  const userRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /api/user/me — 내 프로필 조회
    typedFastify.get(
      "/me",
      {
        schema: {
          tags: ["user"],
          summary: "내 프로필 조회",
          description: "현재 로그인한 OAuth 사용자의 프로필을 조회합니다",
          response: {
            200: UserProfileResponseSchema,
            401: ErrorResponseSchema,
          },
        },
        preHandler: requireAuth,
      },
      async (request, reply) => {
        const oauthAccountId = (request.user as OAuthAccount).id;
        const profile = await userService.getMyProfile(oauthAccountId);
        return reply.status(200).send(profile);
      },
    );

    // PUT /api/user/me — 내 프로필 수정
    typedFastify.put(
      "/me",
      {
        schema: {
          tags: ["user"],
          summary: "내 프로필 수정",
          description:
            "displayName, avatarUrl만 수정 가능합니다. provider, providerUserId 등은 변경 불가합니다.",
          body: UpdateMyProfileBodySchema,
          response: {
            200: UserProfileResponseSchema,
            401: ErrorResponseSchema,
          },
        },
        preHandler: requireAuth,
      },
      async (request, reply) => {
        const oauthAccountId = (request.user as OAuthAccount).id;
        const data = UpdateMyProfileBodySchema.parse(request.body);
        const profile = await userService.updateMyProfile(oauthAccountId, data);
        return reply.status(200).send(profile);
      },
    );

    // DELETE /api/user/me — 회원 탈퇴
    typedFastify.delete(
      "/me",
      {
        schema: {
          tags: ["user"],
          summary: "회원 탈퇴",
          description:
            "계정을 soft delete하고 세션을 파기합니다. 탈퇴 후 댓글/방명록에서 '탈퇴한 사용자'로 표시됩니다.",
          response: {
            204: z.void(),
            401: ErrorResponseSchema,
          },
        },
        preHandler: requireAuth,
      },
      async (request, reply) => {
        const oauthAccountId = (request.user as OAuthAccount).id;
        await userService.deleteMyAccount(oauthAccountId);
        await request.session.destroy();
        return reply.status(204).send();
      },
    );

    fastify.log.info("[User Routes] Registered");
  };

  return userRoute;
}
