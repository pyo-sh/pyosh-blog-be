import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import {
  jsonSchemaTransform,
  createJsonSchemaTransformObject,
} from "fastify-type-provider-zod";
import { env } from "@src/shared/env";

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  // @fastify/swagger 등록 (OpenAPI 스펙 생성 - 항상 등록)
  await fastify.register(swagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Pyosh Blog API",
        description: "Pyosh Blog Backend API Documentation",
        version: "1.0.0",
      },
      servers: [
        {
          url: `${env.CLIENT_PROTOCOL}://localhost:${env.SERVER_PORT}`,
          description: "Development server",
        },
      ],
      tags: [
        { name: "auth", description: "인증 (Admin 로그인, OAuth, CSRF)" },
        { name: "health", description: "헬스 체크" },
        { name: "posts", description: "게시글 CRUD" },
        { name: "comments", description: "댓글 조회/작성/삭제" },
        { name: "guestbook", description: "방명록 조회/작성/삭제" },
        { name: "categories", description: "카테고리 관리" },
        { name: "assets", description: "파일 업로드/관리" },
        { name: "tags", description: "태그 조회" },
        { name: "stats", description: "통계 (조회수, 대시보드)" },
        { name: "user", description: "OAuth 사용자 프로필" },
        { name: "admin", description: "Admin 전용 엔드포인트 (다른 태그와 함께 사용)" },
        { name: "seo", description: "sitemap.xml, rss.xml" },
      ],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: "apiKey",
            in: "cookie",
            name: "connect.sid",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: createJsonSchemaTransformObject({ schemas: {} }),
  });

  // @fastify/swagger-ui 등록 (Swagger UI - 프로덕션에서 비활성화)
  if (env.NODE_ENV !== "production") {
    await fastify.register(swaggerUI, {
      routePrefix: "/docs",
      uiConfig: {
        docExpansion: "list",
        deepLinking: true,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });

    fastify.log.info("[Swagger] UI available at /docs");
  }
};

export default fp(swaggerPlugin, {
  name: "swagger-plugin",
});
