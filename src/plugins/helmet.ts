import helmet from "@fastify/helmet";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { NodeEnv } from "@src/constants/node-env";
import { env } from "@src/shared/env";

const helmetPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(helmet, {
    // 개발 환경에서는 Swagger UI를 위해 CSP를 완화
    contentSecurityPolicy:
      env.NODE_ENV === NodeEnv.DEV
        ? {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "https:"],
            },
          }
        : undefined,
    // HTTPS가 아닌 경우 HSTS 비활성화 (개발 환경)
    hsts: env.CLIENT_PROTOCOL === "https",
  });

  fastify.log.info("[Helmet] Security headers plugin registered");
};

export default fp(helmetPlugin, {
  name: "helmet-plugin",
});
