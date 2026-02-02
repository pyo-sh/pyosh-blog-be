import Fastify, { FastifyInstance, FastifyError } from "fastify";
import {
  ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { NodeEnv } from "@src/constants/node-env";
import { HttpError } from "@src/errors/http-error";
import corsPlugin from "@src/plugins/cors";
import drizzlePlugin from "@src/plugins/drizzle";
import helmetPlugin from "@src/plugins/helmet";
import multipartPlugin from "@src/plugins/multipart";
import passportPlugin from "@src/plugins/passport";
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
import { createTagRoute } from "@src/routes/tags/tag.route";
import { TagService } from "@src/routes/tags/tag.service";
import { createUserRoute } from "@src/routes/user/user.route";
import { UserService } from "@src/routes/user/user.service";
import { FileStorageService } from "@src/services/file-storage.service";
import { env } from "@src/shared/env";

export async function buildApp(): Promise<FastifyInstance> {
  // Fastify 인스턴스 생성
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === NodeEnv.DEV ? "info" : "warn",
      transport:
        env.NODE_ENV === NodeEnv.DEV
          ? {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            }
          : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Zod validator & serializer 설정
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  // 플러그인 등록 (순서 중요: helmet → drizzle → session → passport → multipart → static → swagger → cors)
  await fastify.register(helmetPlugin);
  await fastify.register(drizzlePlugin);
  await fastify.register(sessionPlugin);
  await fastify.register(passportPlugin);
  await fastify.register(multipartPlugin);
  await fastify.register(staticPlugin);
  await fastify.register(swaggerPlugin);
  await fastify.register(corsPlugin);

  // 에러 핸들러 등록
  fastify.setErrorHandler((error, _request, reply) => {
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

    // 기타 에러
    fastify.log.error(error);

    return reply.status(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  });

  // Health check 엔드포인트
  fastify.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // 서비스 인스턴스 생성 (수동 DI)
  const adminService = new AdminService(fastify.db);
  const userService = new UserService(fastify.db);
  const categoryService = new CategoryService(fastify.db);
  const tagService = new TagService(fastify.db);
  const fileStorageService = new FileStorageService();
  const assetService = new AssetService(fastify.db, fileStorageService);
  const postService = new PostService(fastify.db, tagService);
  const commentService = new CommentService(fastify.db);
  const guestbookService = new GuestbookService(fastify.db);

  // 업로드 디렉토리 생성
  await fileStorageService.ensureUploadDir();

  // 라우트 등록
  await fastify.register(createAuthRoute(adminService), {
    prefix: "/api/auth",
  });
  await fastify.register(createUserRoute(userService), { prefix: "/api/user" });
  await fastify.register(createCategoryRoute(categoryService, adminService), {
    prefix: "/api/categories",
  });
  await fastify.register(createTagRoute(tagService, adminService), {
    prefix: "/api/tags",
  });
  await fastify.register(createAssetRoute(assetService, adminService), {
    prefix: "/api/assets",
  });
  await fastify.register(createPostRoute(postService), {
    prefix: "/api/posts",
  });
  await fastify.register(createAdminPostRoute(postService, adminService), {
    prefix: "/api/admin/posts",
  });

  // Comment routes
  await fastify.register(createCommentRoute(commentService), {
    prefix: "/api",
  });
  await fastify.register(
    createAdminCommentRoute(commentService, adminService),
    {
      prefix: "/api/admin",
    },
  );

  // Guestbook routes
  await fastify.register(createGuestbookRoute(guestbookService), {
    prefix: "/api",
  });
  await fastify.register(
    createAdminGuestbookRoute(guestbookService, adminService),
    {
      prefix: "/api/admin",
    },
  );

  return fastify;
}
