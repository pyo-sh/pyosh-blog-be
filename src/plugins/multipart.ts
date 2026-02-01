import fastifyMultipart from "@fastify/multipart";
import { FastifyInstance } from "fastify";
import fastifyPlugin from "fastify-plugin";

/**
 * Multipart 플러그인 설정
 * 파일 업로드를 위한 @fastify/multipart 설정
 */
async function multipartPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 5, // 최대 5개 동시 업로드
    },
    attachFieldsToBody: false, // 직접 file consume
  });
}

export default fastifyPlugin(multipartPlugin, {
  name: "multipart",
});
