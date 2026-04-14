import * as fs from "fs/promises";
import fastifyStatic from "@fastify/static";
import { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";
import { getUploadDir, UPLOADS_URL_PREFIX } from "@src/shared/uploads";
import { env } from "@src/shared/env";

/**
 * Static 파일 서빙 플러그인
 * uploads 디렉토리의 파일을 /uploads/ 경로로 서빙
 */
async function staticPlugin(fastify: FastifyInstance) {
  const uploadDir = getUploadDir();
  const crossOriginResourcePolicy =
    env.NODE_ENV === "development" ? "cross-origin" : "same-site";
  await fs.mkdir(uploadDir, { recursive: true });

  await fastify.register(fastifyStatic, {
    root: uploadDir,
    prefix: UPLOADS_URL_PREFIX,
    decorateReply: false,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30일 (밀리초)
    immutable: true,
    setHeaders(res) {
      // Keep production constrained to same-site while allowing
      // localhost dev ports to embed uploaded images during development.
      res.setHeader(
        "Cross-Origin-Resource-Policy",
        crossOriginResourcePolicy,
      );
    },
  });

  fastify.log.info(
    `Static files serving from: ${uploadDir} at ${UPLOADS_URL_PREFIX}`,
  );
}

export default fastifyPlugin(staticPlugin, {
  name: "static",
});
