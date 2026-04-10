import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { connection, db } from "@src/db/client";

// Drizzle을 Fastify 데코레이터로 등록
declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
  }
}

const drizzlePlugin: FastifyPluginAsync = async (fastify) => {
  try {
    // 연결 테스트
    await connection.query("SELECT 1");
    fastify.log.info("[Drizzle] Database connection initialized");

    // Fastify 인스턴스에 Drizzle 클라이언트 등록
    fastify.decorate("db", db);

    // 서버 종료 시 연결 해제
    fastify.addHook("onClose", async () => {
      await connection.end();
      fastify.log.info("[Drizzle] Database connection closed");
    });
  } catch (err) {
    fastify.log.error(`[Drizzle] Initialization Error: ${err}`);
    throw err;
  }
};

export default fp(drizzlePlugin, {
  name: "drizzle-plugin",
});
