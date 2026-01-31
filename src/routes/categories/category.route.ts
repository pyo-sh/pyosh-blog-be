import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CategoryIdParamSchema,
  CategorySlugParamSchema,
  CategoryListQuerySchema,
  CategoryCreateBodySchema,
  CategoryUpdateBodySchema,
  CategoryOrderUpdateBodySchema,
  CategoryListResponseSchema,
  CategoryGetResponseSchema,
  CategoryCreateResponseSchema,
  CategoryUpdateResponseSchema,
  CategoryOrderUpdateResponseSchema,
} from "./category.schema";
import { requireAdmin } from "@src/hooks/auth.hook";
import { AdminService } from "@src/services/admin.service";
import { CategoryService } from "@src/services/category.service";

/**
 * Category 라우트 플러그인
 * CategoryService와 AdminService를 의존성으로 받아 라우트 핸들러에서 사용
 */
export function createCategoryRoute(
  categoryService: CategoryService,
  adminService: AdminService,
): FastifyPluginAsync {
  const categoryRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance & { withTypeProvider: <T>() => FastifyInstance },
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // GET /api/categories - 전체 카테고리 트리 조회 (Public)
    typedFastify.get(
      "/",
      {
        schema: {
          tags: ["categories"],
          summary: "Get all categories as tree",
          description:
            "전체 카테고리를 계층 구조로 조회합니다. Admin은 include_hidden=true로 숨겨진 카테고리도 조회할 수 있습니다.",
          querystring: CategoryListQuerySchema,
          response: {
            200: CategoryListResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { include_hidden: includeHiddenQuery } = request.query;

        // Admin이 아닌 경우 include_hidden 무시
        const adminId = request.session.get("adminId") as number | undefined;
        const includeHidden = adminId && includeHiddenQuery ? true : false;

        const categories =
          await categoryService.getAllCategoriesTree(includeHidden);

        return reply
          .status(200)
          .header("Cache-Control", "public, max-age=300")
          .send({ categories });
      },
    );

    // GET /api/categories/:slug - slug로 카테고리 조회 (Public)
    typedFastify.get(
      "/:slug",
      {
        schema: {
          tags: ["categories"],
          summary: "Get category by slug",
          description:
            "slug로 카테고리 상세 정보와 하위 카테고리 목록을 조회합니다.",
          params: CategorySlugParamSchema,
          response: {
            200: CategoryGetResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { slug } = request.params;
        const category = await categoryService.getCategoryBySlug(slug);

        return reply.status(200).send({ category });
      },
    );

    // POST /api/categories - 카테고리 생성 (Admin)
    typedFastify.post(
      "/",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["categories"],
          summary: "Create category",
          description: "새 카테고리를 생성합니다. Admin 권한이 필요합니다.",
          body: CategoryCreateBodySchema,
          response: {
            201: CategoryCreateResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { name, parentId, isVisible } = request.body;
        const category = await categoryService.createCategory({
          name,
          parentId,
          isVisible,
        });

        return reply.status(201).send({
          category: {
            ...category,
            createdAt: category.createdAt.toISOString(),
            updatedAt: category.updatedAt.toISOString(),
          },
        });
      },
    );

    // PATCH /api/categories/:id - 카테고리 수정 (Admin)
    typedFastify.patch(
      "/:id",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["categories"],
          summary: "Update category",
          description: "카테고리 정보를 수정합니다. Admin 권한이 필요합니다.",
          params: CategoryIdParamSchema,
          body: CategoryUpdateBodySchema,
          response: {
            200: CategoryUpdateResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const { name, parentId, sortOrder, isVisible } = request.body;

        const category = await categoryService.updateCategory({
          id,
          name,
          parentId,
          sortOrder,
          isVisible,
        });

        return reply.status(200).send({
          category: {
            ...category,
            createdAt: category.createdAt.toISOString(),
            updatedAt: category.updatedAt.toISOString(),
          },
        });
      },
    );

    // PATCH /api/categories/order - 카테고리 순서 일괄 변경 (Admin)
    typedFastify.patch(
      "/order",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["categories"],
          summary: "Update category order",
          description:
            "여러 카테고리의 순서를 일괄 변경합니다. Admin 권한이 필요합니다.",
          body: CategoryOrderUpdateBodySchema,
          response: {
            200: CategoryOrderUpdateResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { items } = request.body;
        await categoryService.updateCategoryOrder(
          items.map((item) => ({
            id: item.id,
            sortOrder: item.sortOrder,
          })),
        );

        return reply.status(200).send({ success: true });
      },
    );

    // DELETE /api/categories/:id - 카테고리 삭제 (Admin)
    typedFastify.delete(
      "/:id",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["categories"],
          summary: "Delete category",
          description:
            "카테고리를 삭제합니다. 하위 카테고리나 게시글이 있으면 삭제할 수 없습니다. Admin 권한이 필요합니다.",
          params: CategoryIdParamSchema,
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        await categoryService.deleteCategory(id);

        return reply.status(204).send();
      },
    );

    fastify.log.info("[Category Routes] Registered");
  };

  return categoryRoute;
}
