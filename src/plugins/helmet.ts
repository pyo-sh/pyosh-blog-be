import helmet from "@fastify/helmet";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { env } from "@src/shared/env";

const helmetPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // CSP는 Next.js 클라이언트가 담당
    // HTTPS가 아닌 경우 HSTS 비활성화 (개발 환경)
    hsts: env.CLIENT_PROTOCOL === "https",
  });

  fastify.log.info("[Helmet] Security headers plugin registered");
};

export default fp(helmetPlugin, {
  name: "helmet-plugin",
});
