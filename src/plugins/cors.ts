import cors from "@fastify/cors";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { env } from "@src/shared/env";

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(cors, {
    origin: [env.CLIENT_URL],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    maxAge: env.NODE_ENV === "production" ? 7200 : 0,
  });

  fastify.log.info("[CORS] Plugin registered");
};

export default fp(corsPlugin, {
  name: "cors-plugin",
});
