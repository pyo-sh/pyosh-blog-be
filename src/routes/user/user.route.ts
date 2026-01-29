import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { UserIdParamSchema, UserUpdateBodySchema } from "./user.schema";
import { UserService } from "@src/services/user.service";

/**
 * User 라우트 플러그인
 * UserService를 의존성으로 받아 라우트 핸들러에서 사용
 */
export function createUserRoute(userService: UserService): FastifyPluginAsync {
  const userRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance & { withTypeProvider: <T>() => FastifyInstance },
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
    // GET /:id - 유저 조회
    typedFastify.get(
      "/:id",
      {
        schema: {
          tags: ["user"],
          summary: "Get user by ID",
          description: "유저 ID로 유저 정보를 조회합니다",
          params: UserIdParamSchema,
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const user = await userService.getUser(id);

        return reply.status(200).send({ user });
      },
    );

    // PUT /:id - 유저 업데이트
    typedFastify.put(
      "/:id",
      {
        schema: {
          tags: ["user"],
          summary: "Update user",
          description: "유저 정보를 업데이트합니다",
          params: UserIdParamSchema,
          body: UserUpdateBodySchema,
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const { name, imageId } = request.body;
        const user = await userService.updateUser({ id, name, imageId });

        return reply.status(200).send({ user });
      },
    );

    // DELETE /:id - 유저 삭제 (soft delete)
    typedFastify.delete(
      "/:id",
      {
        schema: {
          tags: ["user"],
          summary: "Delete user",
          description: "유저를 삭제합니다 (soft delete)",
          params: UserIdParamSchema,
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        await userService.deleteUser(id);

        return reply.status(204).send();
      },
    );

    fastify.log.info("[User Routes] Registered");
  };

  return userRoute;
}
