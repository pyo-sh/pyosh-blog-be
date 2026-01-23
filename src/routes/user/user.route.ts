import { FastifyPluginAsync } from "fastify";
import { UserService } from "@src/services/user.service";

/**
 * User 라우트 플러그인
 * UserService를 의존성으로 받아 라우트 핸들러에서 사용
 */
export function createUserRoute(
  userService: UserService
): FastifyPluginAsync {
  const userRoute: FastifyPluginAsync = async (fastify) => {
    // GET /:id - 유저 조회
    fastify.get<{
      Params: { id: string }; // URL param은 string으로 받음
    }>("/:id", async (request, reply) => {
      const id = parseInt(request.params.id, 10);

      if (isNaN(id) || id <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid user ID",
        });
      }

      const user = await userService.getUser(id);
      return reply.status(200).send({ user });
    });

    // PUT /:id - 유저 업데이트
    fastify.put<{
      Params: { id: string };
      Body: { name?: string; imageId?: number | null };
    }>("/:id", async (request, reply) => {
      const id = parseInt(request.params.id, 10);

      if (isNaN(id) || id <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid user ID",
        });
      }

      const { name, imageId } = request.body;
      const user = await userService.updateUser({ id, name, imageId });

      return reply.status(200).send({ user });
    });

    // DELETE /:id - 유저 삭제 (soft delete)
    fastify.delete<{
      Params: { id: string };
    }>("/:id", async (request, reply) => {
      const id = parseInt(request.params.id, 10);

      if (isNaN(id) || id <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid user ID",
        });
      }

      await userService.deleteUser(id);
      return reply.status(204).send();
    });

    fastify.log.info("[User Routes] Registered");
  };

  return userRoute;
}
