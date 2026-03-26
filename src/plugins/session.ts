import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { DrizzleSessionStore } from "./drizzle-session-store";
import { env } from "@src/shared/env";

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  // @fastify/cookie 등록 (session의 의존성)
  await fastify.register(cookie);

  // @fastify/session 등록 (Drizzle SessionStore 사용)
  const isProduction = env.NODE_ENV === "production";
  await fastify.register(session, {
    secret: env.SESSION_SECRET,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax", // 'strict'은 OAuth 콜백(외부 리다이렉트) 시 쿠키 누락 발생; CSRF 토큰이 주 방어수단
      path: "/",
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
