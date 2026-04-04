import { z } from "zod";
import type { CategoryTreeItem } from "./category.service";

/**
 * Path Parameter Schemas
 */
export const CategoryIdParamSchema = z.object({
  id: z.coerce.number().int().positive().describe("카테고리 ID"),
});

/**
 * Query Parameter Schemas
 */
export const CategoryListQuerySchema = z.object({
  include_hidden: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true")
    .describe("숨겨진 카테고리 포함 여부 (Admin만 유효)"),
});

export const CategoryDeleteQuerySchema = z
  .object({
    action: z.enum(["move", "trash"]).describe("삭제 방식 (move: 게시글 이동, trash: 게시글 휴지통)"),
    moveTo: z.coerce.number().int().positive().optional().describe("게시글을 이동할 카테고리 ID (action=move 시 필수)"),
  })
  .refine((data) => data.action !== "move" || data.moveTo != null, {
    message: "moveTo is required when action is move",
    path: ["moveTo"],
  });

/**
 * Request Body Schemas
 */
export const CategoryCreateBodySchema = z.object({
  name: z.string().min(1).max(50).describe("카테고리 이름 (최대 50자)"),
  parentId: z.number().int().positive().nullable().optional().describe("부모 카테고리 ID (최상위이면 null)"),
  isVisible: z.boolean().optional().describe("카테고리 공개 여부"),
});

export const CategoryUpdateBodySchema = z.object({
  name: z.string().min(1).max(50).optional().describe("카테고리 이름 (최대 50자)"),
  parentId: z.number().int().positive().nullable().optional().describe("부모 카테고리 ID"),
  sortOrder: z.number().int().min(0).optional().describe("정렬 순서"),
  isVisible: z.boolean().optional().describe("카테고리 공개 여부"),
});

const CategoryTreeItemSchema = z
  .object({
    id: z.number().int().positive().describe("카테고리 ID"),
    parentId: z.number().int().positive().nullable().describe("새 부모 카테고리 ID"),
    sortOrder: z.number().int().min(0).describe("새 정렬 순서"),
  })
  .transform(
    ({ id, parentId, sortOrder }): CategoryTreeItem => ({
      id,
      parentId,
      sortOrder,
    }),
  );

export const CategoryTreeUpdateBodySchema = z.object({
  changes: z
    .array(CategoryTreeItemSchema)
    .min(1, "At least one change is required")
    .max(200, "Too many changes in a single request")
    .describe("변경할 카테고리 목록 (최대 200개)"),
});

/**
 * Response Schemas
 */
export const CategoryResponseSchema = z.object({
  id: z.number().describe("카테고리 ID"),
  parentId: z.number().nullable().describe("부모 카테고리 ID"),
  name: z.string().describe("카테고리 이름"),
  slug: z.string().describe("카테고리 슬러그"),
  sortOrder: z.number().describe("정렬 순서"),
  isVisible: z.boolean().describe("공개 여부"),
  publishedPostCount: z.number().describe("발행된 게시글 수"),
  totalPostCount: z.number().describe("전체 게시글 수"),
  createdAt: z.string().describe("생성일 (ISO 8601)"),
  updatedAt: z.string().describe("수정일 (ISO 8601)"),
});

type CategoryTreeResponse = {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  sortOrder: number;
  isVisible: boolean;
  publishedPostCount: number;
  totalPostCount: number;
  createdAt: string;
  updatedAt: string;
  children: CategoryTreeResponse[];
};

export const CategoryTreeResponseSchema: z.ZodType<CategoryTreeResponse> =
  z.lazy(() =>
    CategoryResponseSchema.extend({
      children: z.array(CategoryTreeResponseSchema).describe("하위 카테고리 목록"),
    }),
  ) as z.ZodType<CategoryTreeResponse>;

export type { CategoryTreeResponse };

export const CategoryListResponseSchema = z.object({
  categories: z.array(CategoryTreeResponseSchema).describe("카테고리 트리 목록"),
});

export const CategoryCreateResponseSchema = z.object({
  category: CategoryResponseSchema,
});

export const CategoryUpdateResponseSchema = z.object({
  category: CategoryResponseSchema,
});

export const CategoryTreeUpdateResponseSchema = z.object({
  success: z.boolean().describe("배치 업데이트 성공 여부"),
});

/**
 * Type exports
 */
export type CategoryIdParam = z.infer<typeof CategoryIdParamSchema>;
export type CategoryListQuery = z.infer<typeof CategoryListQuerySchema>;
export type CategoryCreateBody = z.infer<typeof CategoryCreateBodySchema>;
export type CategoryUpdateBody = z.infer<typeof CategoryUpdateBodySchema>;
export type CategoryTreeUpdateBody = z.infer<
  typeof CategoryTreeUpdateBodySchema
>;
export type CategoryDeleteQuery = z.infer<typeof CategoryDeleteQuerySchema>;
