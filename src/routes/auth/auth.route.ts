import fastifyPassport from "@fastify/passport";
import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AdminService } from "./admin.service";
import { HttpError } from "@src/errors/http-error";
import { env } from "@src/shared/env";

// Zod 스키마 정의
const AdminLoginSchema = z.object({
  email: z.string().email("유효한 이메일 주소를 입력하세요"),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다"),
});

const AdminSetupSchema = z.object({
  email: z.string().email("유효한 이메일 주소를 입력하세요"),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다"),
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

    // ===== OAuth Routes =====

    // Google OAuth
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

    // GitHub OAuth
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

    // ===== Admin Auth Routes =====

    // POST /admin/login - 관리자 로그인
    typedFastify.post(
      "/admin/login",
      {
        schema: {
          tags: ["auth"],
          summary: "Admin login",
          description: "관리자 이메일/비밀번호로 로그인합니다",
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
            401: z.object({
              statusCode: z.number(),
              error: z.string(),
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const { email, password } = request.body;

        // 인증 검증
        const admin = await adminService.verifyCredentials(email, password);

        // 세션에 adminId 저장
        request.session.set("adminId", admin.id);

        return reply.status(200).send({ admin });
      },
    );

    // POST /admin/logout - 관리자 로그아웃
    typedFastify.post(
      "/admin/logout",
      {
        schema: {
          tags: ["auth"],
          summary: "Admin logout",
          description: "관리자 세션을 종료합니다",
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
            401: z.object({
              statusCode: z.number(),
              error: z.string(),
              message: z.string(),
            }),
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

    // POST /admin/setup - 초기 관리자 계정 생성
    typedFastify.post(
      "/admin/setup",
      {
        schema: {
          tags: ["auth"],
          summary: "Setup initial admin",
          description:
            "초기 관리자 계정을 생성합니다 (관리자가 없을 때만 가능)",
          body: AdminSetupSchema,
          response: {
            201: z.object({
              admin: z.object({
                id: z.number(),
                email: z.string(),
                createdAt: z.date(),
                updatedAt: z.date(),
                lastLoginAt: z.date().nullable(),
              }),
            }),
            409: z.object({
              statusCode: z.number(),
              error: z.string(),
              message: z.string(),
            }),
          },
        },
      },
      async (request, reply) => {
        const { email, password } = request.body;

        // 이미 관리자가 존재하면 409 반환
        const hasAdmin = await adminService.hasAnyAdmin();
        if (hasAdmin) {
          throw HttpError.conflict("Admin account already exists.");
        }

        // 관리자 생성
        const admin = await adminService.createAdmin({ email, password });

        return reply.status(201).send({ admin });
      },
    );

    fastify.log.info("[Auth Routes] Registered");
  };

  return authRoute;
}

// 기존 export 유지 (호환성)
export default createAuthRoute;
