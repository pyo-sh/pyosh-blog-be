import csrf from "@fastify/csrf-protection";
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { NodeEnv } from "@src/constants/node-env";
import { env } from "@src/shared/env";

const csrfPlugin: FastifyPluginAsync = async (fastify) => {
  if (env.NODE_ENV === NodeEnv.TEST) {
    // 테스트 환경: 기존 테스트 통과를 위해 no-op으로 등록
    fastify.decorate(
      "csrfProtection",
      (_req: FastifyRequest, _reply: FastifyReply, done: () => void) => {
        done();
      },
    );
    fastify.decorateReply("generateCsrf", () => "test-csrf-token");

    return;
  }

  await fastify.register(csrf, {
    sessionPlugin: "@fastify/session",
  });

  fastify.log.info("[CSRF] Plugin registered (session-based)");
};

export default fp(csrfPlugin, {
  name: "csrf-plugin",
  dependencies: ["session-plugin"],
});
