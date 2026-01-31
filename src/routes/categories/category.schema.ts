import { z } from "zod";

/**
 * Path Parameter Schemas
 */
export const CategoryIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const CategorySlugParamSchema = z.object({
  slug: z.string().min(1).max(100),
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

export const CategoryOrderUpdateBodySchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      sortOrder: z.number().int().min(0),
    }),
  ),
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
  createdAt: z.string(), // ISO datetime string
  updatedAt: z.string(), // ISO datetime string
});

export const CategoryTreeResponseSchema: z.ZodType<any> = z.lazy(() =>
  CategoryResponseSchema.extend({
    children: z.array(CategoryTreeResponseSchema),
  }),
);

export const CategoryListResponseSchema = z.object({
  categories: z.array(CategoryTreeResponseSchema),
});

export const CategoryGetResponseSchema = z.object({
  category: CategoryTreeResponseSchema,
});

export const CategoryCreateResponseSchema = z.object({
  category: CategoryResponseSchema,
});

export const CategoryUpdateResponseSchema = z.object({
  category: CategoryResponseSchema,
});

export const CategoryOrderUpdateResponseSchema = z.object({
  success: z.boolean(),
});

/**
 * Type exports
 */
export type CategoryIdParam = z.infer<typeof CategoryIdParamSchema>;
export type CategorySlugParam = z.infer<typeof CategorySlugParamSchema>;
export type CategoryListQuery = z.infer<typeof CategoryListQuerySchema>;
export type CategoryCreateBody = z.infer<typeof CategoryCreateBodySchema>;
export type CategoryUpdateBody = z.infer<typeof CategoryUpdateBodySchema>;
export type CategoryOrderUpdateBody = z.infer<
  typeof CategoryOrderUpdateBodySchema
>;
