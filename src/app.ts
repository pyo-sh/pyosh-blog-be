import Fastify, { FastifyInstance, FastifyError } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import envs from "@src/constants/env";
import { NodeEnv } from "@src/constants/node-env";
import { HttpError } from "@src/errors/http-error";
import corsPlugin from "@src/plugins/cors";
import drizzlePlugin from "@src/plugins/drizzle";
import passportPlugin from "@src/plugins/passport";
import sessionPlugin from "@src/plugins/session";
import swaggerPlugin from "@src/plugins/swagger";
import authRoute from "@src/routes/auth/auth.route";
import { createUserRoute } from "@src/routes/user/user.route";
import { UserService } from "@src/services/user.service";

export async function buildApp(): Promise<FastifyInstance> {
  // Fastify 인스턴스 생성
  const fastify = Fastify({
    logger: {
      level: envs.NODE_ENV === NodeEnv.DEV ? "info" : "warn",
      transport:
        envs.NODE_ENV === NodeEnv.DEV
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

  // 플러그인 등록 (순서 중요: drizzle → session → passport → swagger → cors)
  await fastify.register(drizzlePlugin);
  await fastify.register(sessionPlugin);
  await fastify.register(passportPlugin);
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
  const userService = new UserService(fastify.db);

  // 라우트 등록
  await fastify.register(authRoute, { prefix: "/api/auth" });
  await fastify.register(createUserRoute(userService), { prefix: "/api/user" });

  return fastify;
}
