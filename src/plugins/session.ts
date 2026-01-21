import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import { TypeormStore } from "typeorm-store";
import envs from "@src/constants/env";
import { SessionEntity } from "@src/entities/session.entity";

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  // @fastify/cookie 등록 (session의 의존성)
  await fastify.register(cookie);

  // TypeORM repository 가져오기
  const repository = fastify.typeorm.getRepository(SessionEntity);

  // @fastify/session 등록
  await fastify.register(session, {
    secret: envs.SESSION_SECRET,
    saveUninitialized: false,
    cookie: {
      secure: envs.CLIENT_PROTOCOL === "https",
      maxAge: 24 * 60 * 60 * 1000, // 24시간
    },
    store: new TypeormStore({
      repository,
    }),
  });

  fastify.log.info("[Session] Plugin registered");
};

export default fp(sessionPlugin, {
  name: "session-plugin",
  dependencies: ["typeorm-plugin"], // TypeORM이 먼저 로드되어야 함
});
