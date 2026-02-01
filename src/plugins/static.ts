import * as path from "path";
import fastifyStatic from "@fastify/static";
import { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

/**
 * Static 파일 서빙 플러그인
 * uploads 디렉토리의 파일을 /uploads/ 경로로 서빙
 */
async function staticPlugin(fastify: FastifyInstance) {
  const uploadDir =
    process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

  await fastify.register(fastifyStatic, {
    root: uploadDir,
    prefix: "/uploads/",
    decorateReply: false,
  });

  fastify.log.info(`Static files serving from: ${uploadDir} at /uploads/`);
}

export default fastifyPlugin(staticPlugin, {
  name: "static",
});
