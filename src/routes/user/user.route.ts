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
      Params: { id: string };
    }>(
      "/:id",
      {
        schema: {
          tags: ["user"],
          summary: "Get user by ID",
          description: "유저 ID로 유저 정보를 조회합니다",
          params: {
            type: "object",
            properties: {
              id: { type: "string", description: "User ID" },
            },
            required: ["id"],
          },
          response: {
            200: {
              description: "Successful response",
              type: "object",
              properties: {
                user: {
                  type: "object",
                  properties: {
                    id: { type: "number" },
                    name: { type: "string" },
                    githubId: { type: ["string", "null"] },
                    googleEmail: { type: ["string", "null"] },
                    writable: { type: "boolean" },
                    imageId: { type: ["number", "null"] },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
                    deletedAt: { type: ["string", "null"], format: "date-time" },
                  },
                },
              },
            },
            400: {
              description: "Bad request",
              type: "object",
              properties: {
                statusCode: { type: "number" },
                error: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      async (request, reply) => {
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
    }>(
      "/:id",
      {
        schema: {
          tags: ["user"],
          summary: "Update user",
          description: "유저 정보를 업데이트합니다",
          params: {
            type: "object",
            properties: {
              id: { type: "string", description: "User ID" },
            },
            required: ["id"],
          },
          body: {
            type: "object",
            properties: {
              name: { type: "string", minLength: 1, maxLength: 20 },
              imageId: { type: ["number", "null"] },
            },
          },
          response: {
            200: {
              description: "Successful response",
              type: "object",
              properties: {
                user: {
                  type: "object",
                  properties: {
                    id: { type: "number" },
                    name: { type: "string" },
                    githubId: { type: ["string", "null"] },
                    googleEmail: { type: ["string", "null"] },
                    writable: { type: "boolean" },
                    imageId: { type: ["number", "null"] },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
                    deletedAt: { type: ["string", "null"], format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
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
    }>(
      "/:id",
      {
        schema: {
          tags: ["user"],
          summary: "Delete user",
          description: "유저를 삭제합니다 (soft delete)",
          params: {
            type: "object",
            properties: {
              id: { type: "string", description: "User ID" },
            },
            required: ["id"],
          },
          response: {
            204: {
              description: "Successfully deleted",
              type: "null",
            },
          },
        },
      },
      async (request, reply) => {
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
