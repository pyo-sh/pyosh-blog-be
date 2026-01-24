import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import envs from "@src/constants/env";

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  // @fastify/swagger 등록 (OpenAPI 스펙 생성)
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
          url: `${envs.CLIENT_PROTOCOL}://localhost:${envs.SERVER_PORT}`,
          description: "Development server",
        },
      ],
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "user", description: "User management endpoints" },
        { name: "health", description: "Health check endpoints" },
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
  });

  // @fastify/swagger-ui 등록 (Swagger UI 제공)
  await fastify.register(swaggerUI, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });

  fastify.log.info("[Swagger] Plugin registered - UI available at /docs");
};

export default fp(swaggerPlugin, {
  name: "swagger-plugin",
});
