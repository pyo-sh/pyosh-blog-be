import rateLimit from "@fastify/rate-limit";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { NodeEnv } from "@src/constants/node-env";
import { env } from "@src/shared/env";

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  if (env.NODE_ENV === NodeEnv.TEST) {
    // 테스트 환경에서는 Rate Limit 비활성화 (반복 로그인 등 테스트 패턴 허용)
    fastify.log.info("[Rate Limit] Skipped in test environment");

    return;
  }

  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
  });

  fastify.log.info("[Rate Limit] Plugin registered (global: 100 req/min)");
};

export default fp(rateLimitPlugin, {
  name: "rate-limit-plugin",
});
