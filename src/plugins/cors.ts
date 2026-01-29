import cors from "@fastify/cors";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { env } from "@src/shared/env";

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(cors, {
    origin: [env.CLIENT_URL],
    credentials: true,
  });

  fastify.log.info("[CORS] Plugin registered");
};

export default fp(corsPlugin, {
  name: "cors-plugin",
});
