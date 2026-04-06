import fastifyPassport from "@fastify/passport";
import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AdminService } from "./admin.service";
import { HttpError } from "@src/errors/http-error";
import { ErrorResponseSchema } from "@src/schemas/common";
import { env } from "@src/shared/env";

const ADMIN_USERNAME_REGEX = /^[\p{L}\p{N}_.-]+$/u;

// Zod 스키마 정의
const AdminLoginSchema = z.object({
  email: z
    .string()
    .min(4, "사용자명은 최소 4자 이상이어야 합니다")
    .max(100, "관리자 식별자는 최대 100자까지 가능합니다")
    .refine(
      (value) =>
        z.string().email().safeParse(value).success ||
        ADMIN_USERNAME_REGEX.test(value),
      "관리자 식별자는 이메일 또는 사용자명 형식이어야 합니다",
    )
    .describe("관리자 사용자명 또는 기존 이메일"),
  password: z
    .string()
    .min(8, "비밀번호는 최소 8자 이상이어야 합니다")
    .describe("관리자 비밀번호 (최소 8자)"),
});

/**
 * Auth 라우트 플러그인
 * AdminService를 의존성으로 받아 Admin 인증 처리
 */
export function createAuthRoute(
  adminService: AdminService,
): FastifyPluginAsync {
  const authRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // ===== OAuth Routes (registered only when credentials are configured) =====

    // Google OAuth
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      fastify.get(
        "/google",
        fastifyPassport.authenticate("google", {
          scope: ["email", "profile"],
        }),
      );

      fastify.get(
        "/google/callback",
        fastifyPassport.authenticate("google", {
          successRedirect: new URL(env.LOGIN_SUCCESS_PATH, env.CLIENT_URL).href,
          failureRedirect: new URL(env.LOGIN_FAILURE_PATH, env.CLIENT_URL).href,
        }),
      );
    }

    // GitHub OAuth
    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
      fastify.get(
        "/github",
        fastifyPassport.authenticate("github", {
          scope: ["user:email"],
        }),
      );

      fastify.get(
        "/github/callback",
        fastifyPassport.authenticate("github", {
          successRedirect: new URL(env.LOGIN_SUCCESS_PATH, env.CLIENT_URL).href,
          failureRedirect: new URL(env.LOGIN_FAILURE_PATH, env.CLIENT_URL).href,
        }),
      );
    }

    // ===== Admin Auth Routes =====

    // GET /csrf-token - CSRF 토큰 발급
    typedFastify.get(
      "/csrf-token",
      {
        schema: {
          tags: ["auth"],
          summary: "CSRF 토큰 발급",
          description:
            "state-changing 요청(POST/PUT/PATCH/DELETE)에 필요한 CSRF 토큰을 발급합니다. " +
            "세션에 시크릿을 저장하고 토큰을 반환합니다.\n\n" +
            "발급된 토큰은 `x-csrf-token` 헤더에 포함하여 요청을 보내야 합니다. " +
            "세션이 유지되는 동안 토큰이 유효합니다.",
          response: {
            200: z.object({
              token: z.string().describe("CSRF 토큰 값"),
            }),
          },
        },
      },
      async (_request, reply) => {
        const token = reply.generateCsrf();

        return reply.status(200).send({ token });
      },
    );

    // POST /admin/login - 관리자 로그인
    typedFastify.post(
      "/admin/login",
      {
        config: {
          rateLimit: {
            max: 5,
            timeWindow: "1 minute",
          },
        },
        schema: {
          tags: ["auth"],
          summary: "Admin login",
          description:
            "관리자 사용자명/비밀번호로 로그인합니다. 기존 배포 환경의 이메일 식별자도 전환 기간 동안 허용합니다.\n\n" +
            "**Rate limit**: 5회/분",
          body: AdminLoginSchema,
          response: {
            200: z.object({
              admin: z.object({
                id: z.number(),
                email: z.string(),
                createdAt: z.date(),
                updatedAt: z.date(),
                lastLoginAt: z.date().nullable(),
              }),
            }),
            401: ErrorResponseSchema,
            429: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { email, password } = request.body;

        // 요청 필드명은 유지하되 내부 source of truth는 username이다.
        const admin = await adminService.verifyCredentials(email, password);

        // 세션에 adminId 저장
        request.session.set("adminId", admin.id);

        return reply.status(200).send({
          admin: {
            ...admin,
            email: admin.username,
          },
        });
      },
    );

    // POST /admin/logout - 관리자 로그아웃
    typedFastify.post(
      "/admin/logout",
      {
        onRequest: fastify.csrfProtection,
        schema: {
          tags: ["auth"],
          summary: "Admin logout",
          description:
            "관리자 세션을 종료합니다.\n\n" +
            "**CSRF 토큰 필요**: `GET /api/auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          response: {
            204: z.void(),
          },
        },
      },
      async (request, reply) => {
        // 세션 파기
        await request.session.destroy();

        return reply.status(204).send();
      },
    );

    // GET /me - 현재 로그인한 사용자 정보
    typedFastify.get(
      "/me",
      {
        schema: {
          tags: ["auth"],
          summary: "Get current user",
          description:
            "현재 로그인한 사용자 정보를 조회합니다 (Admin 또는 OAuth)",
          response: {
            200: z.union([
              z.object({
                type: z.literal("admin"),
                id: z.number(),
                email: z.string(),
                createdAt: z.date(),
                updatedAt: z.date(),
                lastLoginAt: z.date().nullable(),
              }),
              z.object({
                type: z.literal("oauth"),
                id: z.number(),
                name: z.string(),
                email: z.string().nullable(),
                githubId: z.string().nullable(),
                googleEmail: z.string().nullable(),
              }),
            ]),
            401: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const adminId = request.session.get("adminId") as number | undefined;

        // Admin 세션 확인
        if (adminId) {
          const admin = await adminService.getAdminById(adminId);

          return reply.status(200).send({
            type: "admin" as const,
            ...admin,
            email: admin.username,
          });
        }

        // OAuth 세션 확인 (Passport user)
        if (request.user) {
          return reply.status(200).send({
            type: "oauth" as const,
            ...request.user,
          });
        }

        // 둘 다 없으면 401
        throw HttpError.unauthorized("Login required.");
      },
    );

    fastify.log.info("[Auth Routes] Registered");
  };

  return authRoute;
}

// 기존 export 유지 (호환성)
export default createAuthRoute;
