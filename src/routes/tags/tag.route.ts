import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  TagIdParamSchema,
  TagSearchQuerySchema,
  TagCreateBodySchema,
  TagListResponseSchema,
  TagCreateResponseSchema,
} from "./tag.schema";
import { requireAdmin } from "@src/hooks/auth.hook";
import { AdminService } from "@src/services/admin.service";
import { TagService } from "@src/services/tag.service";

/**
 * Tag 라우트 플러그인
 * TagService와 AdminService를 의존성으로 받아 라우트 핸들러에서 사용
 */
export function createTagRoute(
  tagService: TagService,
  adminService: AdminService,
): FastifyPluginAsync {
  const tagRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance & { withTypeProvider: <T>() => FastifyInstance },
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /api/tags - 태그 목록 조회 (Public)
    typedFastify.get(
      "/",
      {
        schema: {
          tags: ["tags"],
          summary: "Get all tags or search tags",
          description:
            "전체 태그 목록을 조회하거나 keyword로 검색합니다. 게시글 수 포함 옵션 제공.",
          querystring: TagSearchQuerySchema,
          response: {
            200: TagListResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { keyword } = request.query;

        let tags;
        if (keyword) {
          // 키워드 검색
          tags = await tagService.searchTags(keyword);
        } else {
          // 전체 조회 (게시글 수 포함)
          tags = await tagService.getAllTags(true);
        }

        return reply.status(200).send({
          tags: tags.map((tag) => ({
            ...tag,
            createdAt: tag.createdAt.toISOString(),
          })),
        });
      },
    );

    // POST /api/tags - 태그 생성 (Admin, 선택)
    typedFastify.post(
      "/",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["tags"],
          summary: "Create tag",
          description:
            "새 태그를 생성합니다. Admin 권한이 필요합니다. 참고: 게시글 작성 시 자동 생성되므로 직접 생성은 선택 사항입니다.",
          body: TagCreateBodySchema,
          response: {
            201: TagCreateResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { name } = request.body;

        // 태그 이름을 소문자로 정규화
        const normalizedName = name.trim().toLowerCase();

        // getOrCreateTags를 사용하여 생성
        const tagIds = await tagService.getOrCreateTags([normalizedName]);

        // 생성된 태그 조회
        const tags = await tagService.getAllTags(false);
        const createdTag = tags.find((tag) => tagIds.includes(tag.id));

        if (!createdTag) {
          throw new Error("태그 생성에 실패했습니다.");
        }

        return reply.status(201).send({
          tag: {
            ...createdTag,
            createdAt: createdTag.createdAt.toISOString(),
          },
        });
      },
    );

    // DELETE /api/tags/:id - 태그 삭제 (Admin, 선택)
    typedFastify.delete(
      "/:id",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["tags"],
          summary: "Delete tag",
          description:
            "태그를 삭제합니다. Admin 권한이 필요합니다. 참고: 게시글에 연결된 태그는 삭제할 수 없습니다.",
          params: TagIdParamSchema,
        },
      },
      async (_request, reply) => {
        // Phase 5 Posts 모듈 구현 후 게시글 연결 확인 로직 추가 예정
        // 현재는 deleteUnusedTags 사용 권장
        return reply.status(204).send();
      },
    );

    fastify.log.info("[Tag Routes] Registered");
  };

  return tagRoute;
}
