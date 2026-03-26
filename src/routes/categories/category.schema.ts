import { z } from "zod";

/**
 * Path Parameter Schemas
 */
export const CategoryIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Query Parameter Schemas
 */
export const CategoryListQuerySchema = z.object({
  include_hidden: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
});

export const CategoryDeleteQuerySchema = z
  .object({
    action: z.enum(["move", "trash"]),
    moveTo: z.coerce.number().int().positive().optional(),
  })
  .refine((data) => data.action !== "move" || data.moveTo != null, {
    message: "moveTo is required when action is move",
    path: ["moveTo"],
  });

/**
 * Request Body Schemas
 */
export const CategoryCreateBodySchema = z.object({
  name: z.string().min(1).max(50),
  parentId: z.number().int().positive().nullable().optional(),
  isVisible: z.boolean().optional(),
});

export const CategoryUpdateBodySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  parentId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
});

export const CategoryTreeUpdateBodySchema = z.object({
  changes: z
    .array(
      z.object({
        id: z.number().int().positive(),
        parentId: z.number().int().positive().nullable(),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1, "At least one change is required")
    .max(200, "Too many changes in a single request"),
});

/**
 * Response Schemas
 */
export const CategoryResponseSchema = z.object({
  id: z.number(),
  parentId: z.number().nullable(),
  name: z.string(),
  slug: z.string(),
  sortOrder: z.number(),
  isVisible: z.boolean(),
  publishedPostCount: z.number(),
  totalPostCount: z.number(),
  createdAt: z.string(), // ISO datetime string
  updatedAt: z.string(), // ISO datetime string
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
      children: z.array(CategoryTreeResponseSchema),
    }),
  ) as z.ZodType<CategoryTreeResponse>;

export type { CategoryTreeResponse };

export const CategoryListResponseSchema = z.object({
  categories: z.array(CategoryTreeResponseSchema),
});

export const CategoryCreateResponseSchema = z.object({
  category: CategoryResponseSchema,
});

export const CategoryUpdateResponseSchema = z.object({
  category: CategoryResponseSchema,
});

export const CategoryTreeUpdateResponseSchema = z.object({
  success: z.boolean(),
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
