import Fastify, { FastifyInstance, FastifyError } from "fastify";
import {
  ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { HttpError } from "@src/errors/http-error";
import corsPlugin from "@src/plugins/cors";
import csrfPlugin from "@src/plugins/csrf";
import drizzlePlugin from "@src/plugins/drizzle";
import helmetPlugin from "@src/plugins/helmet";
import loggerPlugin, { buildFastifyLoggerConfig } from "@src/plugins/logger";
import multipartPlugin from "@src/plugins/multipart";
import passportPlugin from "@src/plugins/passport";
import rateLimitPlugin from "@src/plugins/rate-limit";
import sessionPlugin from "@src/plugins/session";
import staticPlugin from "@src/plugins/static";
import swaggerPlugin from "@src/plugins/swagger";
import { createAssetRoute } from "@src/routes/assets/asset.route";
import { AssetService } from "@src/routes/assets/asset.service";
import { AdminService } from "@src/routes/auth/admin.service";
import { createAuthRoute } from "@src/routes/auth/auth.route";
import { createCategoryRoute } from "@src/routes/categories/category.route";
import { CategoryService } from "@src/routes/categories/category.service";
import {
  createCommentRoute,
  createAdminCommentRoute,
} from "@src/routes/comments/comment.route";
import { CommentService } from "@src/routes/comments/comment.service";
import {
  createGuestbookRoute,
  createAdminGuestbookRoute,
} from "@src/routes/guestbook/guestbook.route";
import { GuestbookService } from "@src/routes/guestbook/guestbook.service";
import {
  createPostRoute,
  createAdminPostRoute,
} from "@src/routes/posts/post.route";
import { PostService } from "@src/routes/posts/post.service";
import { createSeoRoute } from "@src/routes/seo/seo.route";
import {
  createSettingsRoute,
  createAdminSettingsRoute,
} from "@src/routes/settings/settings.route";
import { SettingsService } from "@src/routes/settings/settings.service";
import {
  createStatsRoute,
  createAdminStatsRoute,
} from "@src/routes/stats/stats.route";
import { createTagRoute } from "@src/routes/tags/tag.route";
import { TagService } from "@src/routes/tags/tag.service";
import { createUserRoute } from "@src/routes/user/user.route";
import { UserService } from "@src/routes/user/user.service";
import { FileStorageService } from "@src/services/file-storage.service";
import {
  getAppVersion,
  getDatabaseHealth,
  getHealthStatus,
  getMemoryUsage,
} from "@src/services/health.service";
import { StatsService } from "@src/services/stats.service";

export async function buildApp(): Promise<FastifyInstance> {
  // Fastify 인스턴스 생성
  const fastify = Fastify({
    ...buildFastifyLoggerConfig(),
  }).withTypeProvider<ZodTypeProvider>();

  // Zod validator & serializer 설정
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // 플러그인 등록 (순서 중요: logger → helmet → rate-limit → drizzle → session → csrf → passport → multipart → static → swagger → cors)
  await fastify.register(loggerPlugin);
  await fastify.register(helmetPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(drizzlePlugin);
  await fastify.register(sessionPlugin);
  await fastify.register(csrfPlugin);
  await fastify.register(passportPlugin);
  await fastify.register(multipartPlugin);
  await fastify.register(staticPlugin);
  await fastify.register(swaggerPlugin);
  await fastify.register(corsPlugin);

  // 에러 핸들러 등록
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      });
    }

    // Fastify/Zod validation error
    const fastifyError = error as FastifyError;
    if (fastifyError.validation) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        message: fastifyError.message,
        details: fastifyError.validation,
      });
    }

    if (
      typeof fastifyError.statusCode === "number" &&
      fastifyError.code?.startsWith("FST_CSRF_")
    ) {
      const headers = (
        fastifyError as FastifyError & { headers?: Record<string, string> }
      ).headers;

      if (headers) {
        for (const [name, value] of Object.entries(headers)) {
          reply.header(name, value);
        }
      }

      return reply.status(fastifyError.statusCode).send({
        statusCode: fastifyError.statusCode,
        error: fastifyError.code ?? fastifyError.name,
        message: fastifyError.message,
      });
    }

    // 기타 에러: 스택 트레이스 + 요청 컨텍스트 로깅 (pino serializes Error via err key)
    request.log.error(
      {
        err: error,
        method: request.method,
        url: request.routeOptions.url,
        ip: request.ip,
        userId: (request.session as { user?: { id?: unknown } } | undefined)
          ?.user?.id,
      },
      "Unhandled server error",
    );

    return reply.status(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  });

  // Lightweight liveness check for load balancers and uptime probes.
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  fastify.get("/health/live", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: getAppVersion(),
    };
  });

  fastify.get("/health/ready", async (_, reply) => {
    const database = await getDatabaseHealth(fastify);
    const health = getHealthStatus("ready", database);

    if (health.httpStatusCode !== 200) {
      reply.status(health.httpStatusCode);
    }

    return {
      status: health.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: getAppVersion(),
      memory: getMemoryUsage(),
      database,
    };
  });

  fastify.get("/health/status", async (_, reply) => {
    const database = await getDatabaseHealth(fastify);
    const health = getHealthStatus("health", database);

    if (health.httpStatusCode !== 200) {
      reply.status(health.httpStatusCode);
    }

    return {
      status: health.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: getAppVersion(),
      memory: getMemoryUsage(),
      database,
    };
  });

  // 서비스 인스턴스 생성 (수동 DI)
  const adminService = new AdminService(fastify.db);
  const categoryService = new CategoryService(fastify.db);
  const tagService = new TagService(fastify.db);
  const fileStorageService = new FileStorageService();
  const assetService = new AssetService(fastify.db, fileStorageService);
  const postService = new PostService(fastify.db, tagService);
  const commentService = new CommentService(fastify.db);
  const guestbookService = new GuestbookService(fastify.db);
  const settingsService = new SettingsService(fastify.db);
  const statsService = new StatsService(fastify.db);
  const userService = new UserService(fastify.db);

  // 업로드 디렉토리 생성
  await fileStorageService.ensureUploadDir();

  // 라우트 등록
  await fastify.register(createAuthRoute(adminService), {
    prefix: "/auth",
  });
  await fastify.register(createCategoryRoute(categoryService, adminService), {
    prefix: "/categories",
  });
  await fastify.register(createAssetRoute(assetService, adminService), {
    prefix: "/assets",
  });
  await fastify.register(createPostRoute(postService), {
    prefix: "/posts",
  });
  await fastify.register(createTagRoute(tagService), {
    prefix: "/tags",
  });
  // Comment routes (public)
  await fastify.register(createCommentRoute(commentService), {
    prefix: "",
  });

  // Guestbook routes (public)
  await fastify.register(
    createGuestbookRoute(guestbookService, settingsService),
    {
      prefix: "",
    },
  );

  // Settings routes (public)
  await fastify.register(createSettingsRoute(settingsService), {
    prefix: "/settings",
  });

  // Stats routes (public)
  await fastify.register(createStatsRoute(statsService), {
    prefix: "/stats",
  });

  // Admin routes: CSRF 보호 (GET 제외) 일괄 적용
  await fastify.register(
    async (adminRoutes) => {
      const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);
      adminRoutes.addHook("onRequest", (request, reply, done) => {
        if (!CSRF_SAFE_METHODS.has(request.method)) {
          return fastify.csrfProtection(request, reply, done);
        }
        done();
      });

      await adminRoutes.register(
        createAdminPostRoute(postService, adminService),
        {
          prefix: "/posts",
        },
      );
      await adminRoutes.register(
        createAdminCommentRoute(commentService, adminService),
      );
      await adminRoutes.register(
        createAdminGuestbookRoute(guestbookService, adminService),
      );
      await adminRoutes.register(
        createAdminSettingsRoute(settingsService, adminService),
      );
      await adminRoutes.register(
        createAdminStatsRoute(statsService, adminService),
        {
          prefix: "/stats",
        },
      );
    },
    { prefix: "/admin" },
  );
  await fastify.register(createSeoRoute());

  // User routes (OAuth 인증 필수)
  await fastify.register(createUserRoute(userService), {
    prefix: "/user",
  });

  return fastify;
}
