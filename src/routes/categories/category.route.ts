import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CategoryIdParamSchema,
  CategoryListQuerySchema,
  CategoryDeleteQuerySchema,
  CategoryCreateBodySchema,
  CategoryUpdateBodySchema,
  CategoryTreeUpdateBodySchema,
  CategoryListResponseSchema,
  CategoryCreateResponseSchema,
  CategoryUpdateResponseSchema,
  CategoryTreeUpdateResponseSchema,
  CategoryTreeResponse,
} from "./category.schema";
import { CategoryService, CategoryTree } from "./category.service";
import { requireAdmin } from "@src/hooks/auth.hook";
import { AdminService } from "@src/routes/auth/admin.service";
import { ErrorResponseSchema } from "@src/schemas/common";

/**
 * CategoryTree의 Date 필드를 ISO 문자열로 재귀 변환
 */
function serializeCategoryTree(cat: CategoryTree): CategoryTreeResponse {
  return {
    ...cat,
    createdAt: cat.createdAt.toISOString(),
    updatedAt: cat.updatedAt.toISOString(),
    children: cat.children.map(serializeCategoryTree),
  };
}

/**
 * Category 라우트 플러그인
 * CategoryService와 AdminService를 의존성으로 받아 라우트 핸들러에서 사용
 */
export function createCategoryRoute(
  categoryService: CategoryService,
  adminService: AdminService,
): FastifyPluginAsync {
  const categoryRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance,
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
          .header(
            "Cache-Control",
            includeHidden ? "no-store" : "public, max-age=300",
          )
          .send({ categories: categories.map(serializeCategoryTree) });
      },
    );

    // POST /api/categories - 카테고리 생성 (Admin)
    typedFastify.post(
      "/",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["categories"],
          summary: "Create category",
          description:
            "새 카테고리를 생성합니다. Admin 권한이 필요합니다.\n\n" +
            "**CSRF 토큰 필요**: `GET /api/auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          body: CategoryCreateBodySchema,
          response: {
            201: CategoryCreateResponseSchema,
            400: ErrorResponseSchema,
            403: ErrorResponseSchema,
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

    // PATCH /api/categories/tree - 카테고리 트리 배치 변경 (Admin)
    // 반드시 /:id 앞에 등록해야 정적 경로 우선 매칭 보장
    typedFastify.patch(
      "/tree",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["categories"],
          summary: "Batch update category tree",
          description:
            "여러 카테고리의 parentId와 sortOrder를 단일 트랜잭션으로 변경합니다. Admin 권한이 필요합니다.\n\n" +
            "**CSRF 토큰 필요**: `GET /api/auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          body: CategoryTreeUpdateBodySchema,
          response: {
            200: CategoryTreeUpdateResponseSchema,
            400: ErrorResponseSchema,
            403: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { changes } = CategoryTreeUpdateBodySchema.parse(request.body);
        await categoryService.updateCategoryTree(changes);

        return reply.status(200).send({ success: true });
      },
    );

    // PATCH /api/categories/:id - 카테고리 수정 (Admin)
    typedFastify.patch(
      "/:id",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["categories"],
          summary: "Update category",
          description:
            "카테고리 정보를 수정합니다. Admin 권한이 필요합니다.\n\n" +
            "**CSRF 토큰 필요**: `GET /api/auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          params: CategoryIdParamSchema,
          body: CategoryUpdateBodySchema,
          response: {
            200: CategoryUpdateResponseSchema,
            400: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
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

    // DELETE /api/categories/:id - 카테고리 삭제 (Admin)
    typedFastify.delete(
      "/:id",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["categories"],
          summary: "Delete category",
          description:
            "카테고리를 삭제합니다. action=move면 게시글을 지정 카테고리로 이동, action=trash면 게시글을 휴지통으로 이동합니다. 하위 카테고리가 있으면 삭제할 수 없습니다. Admin 권한이 필요합니다.\n\n" +
            "**CSRF 토큰 필요**: `GET /api/auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          params: CategoryIdParamSchema,
          querystring: CategoryDeleteQuerySchema,
          response: {
            204: z.void(),
            400: ErrorResponseSchema,
            403: ErrorResponseSchema,
            404: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const { action, moveTo } = request.query;

        await categoryService.deleteCategory({ id, action, moveTo });

        return reply.status(204).send();
      },
    );

    fastify.log.info("[Category Routes] Registered");
  };

  return categoryRoute;
}
