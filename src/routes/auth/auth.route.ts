import { FastifyPluginAsync } from "fastify";
import fastifyPassport from "@fastify/passport";
import envs from "@src/constants/env";

const authRoute: FastifyPluginAsync = async (fastify) => {
  // Google OAuth
  fastify.get(
    "/google",
    fastifyPassport.authenticate("google", {
      scope: ["email", "profile"],
    })
  );

  fastify.get(
    "/google/callback",
    fastifyPassport.authenticate("google", {
      successRedirect: new URL(
        envs.LOGIN_SUCCESS_PATH,
        envs.CLIENT_URL
      ).href,
      failureRedirect: new URL(
        envs.LOGIN_FAILURE_PATH,
        envs.CLIENT_URL
      ).href,
    })
  );

  // GitHub OAuth
  fastify.get(
    "/github",
    fastifyPassport.authenticate("github", {
      scope: ["user:email"],
    })
  );

  fastify.get(
    "/github/callback",
    fastifyPassport.authenticate("github", {
      successRedirect: new URL(
        envs.LOGIN_SUCCESS_PATH,
        envs.CLIENT_URL
      ).href,
      failureRedirect: new URL(
        envs.LOGIN_FAILURE_PATH,
        envs.CLIENT_URL
      ).href,
    })
  );

  fastify.log.info("[Auth Routes] Registered");
};

export default authRoute;
