import path from "path";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import envs from "@src/constants/env";
import { NodeEnv } from "@src/constants/node-env";

// TypeORM DataSource 생성
const typeormDataSource = new DataSource({
  type: "mysql",
  host: envs.DB_HOST,
  port: envs.DB_PORT,
  username: envs.DB_USER,
  password: envs.DB_PSWD,
  database: envs.DB_DTBS,
  entities: [path.join(__dirname, "../entities", `./**/*.entity.{js,ts}`)],
  logging: envs.NODE_ENV === NodeEnv.DEV,
  namingStrategy: new SnakeNamingStrategy(),
});

// TypeORM을 Fastify 데코레이터로 등록
declare module "fastify" {
  interface FastifyInstance {
    typeorm: DataSource;
  }
}

const typeormPlugin: FastifyPluginAsync = async (fastify) => {
  try {
    await typeormDataSource.initialize();
    fastify.log.info("[TypeORM] Database connection initialized");

    // Fastify 인스턴스에 TypeORM DataSource 등록
    fastify.decorate("typeorm", typeormDataSource);

    // 서버 종료 시 TypeORM 연결 해제
    fastify.addHook("onClose", async () => {
      await typeormDataSource.destroy();
      fastify.log.info("[TypeORM] Database connection closed");
    });
  } catch (err) {
    fastify.log.error(`[TypeORM] Initialization Error: ${err}`);
    throw err;
  }
};

export default fp(typeormPlugin, {
  name: "typeorm-plugin",
});
