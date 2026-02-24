import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { TagListResponseSchema } from "./tag.schema";
import { TagService } from "./tag.service";

export function createTagRoute(tagService: TagService): FastifyPluginAsync {
  const tagRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    typedFastify.get(
      "/",
      {
        schema: {
          tags: ["tags"],
          summary: "Get public tag list with post counts",
          description:
            "공개(public) + 발행(published) 상태의 게시글을 기준으로 태그 목록과 postCount를 반환합니다.",
          response: {
            200: TagListResponseSchema,
          },
        },
      },
      async (_request, reply) => {
        const tags = await tagService.getPublicTagsWithCount();

        return reply.status(200).send({ tags });
      },
    );

    fastify.log.info("[Tag Routes] Registered");
  };

  return tagRoute;
}
