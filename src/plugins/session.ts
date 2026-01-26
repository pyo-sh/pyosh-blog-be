import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { DrizzleSessionStore } from "./drizzle-session-store";
import envs from "@src/constants/env";

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  // @fastify/cookie 등록 (session의 의존성)
  await fastify.register(cookie);

  // @fastify/session 등록 (Drizzle SessionStore 사용)
  await fastify.register(session, {
    secret: envs.SESSION_SECRET,
    saveUninitialized: false,
    cookie: {
      secure: envs.CLIENT_PROTOCOL === "https",
      maxAge: 24 * 60 * 60 * 1000, // 24시간
    },
    store: new DrizzleSessionStore(),
  });

  fastify.log.info("[Session] Plugin registered");
};

export default fp(sessionPlugin, {
  name: "session-plugin",
  dependencies: ["drizzle-plugin"], // Drizzle이 먼저 로드되어야 함
});
