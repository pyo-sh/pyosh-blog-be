import { z } from "zod";

/**
 * Path Parameter Schemas
 */
export const TagIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Query Parameter Schemas
 */
export const TagSearchQuerySchema = z.object({
  keyword: z.string().min(1).optional(),
});

/**
 * Request Body Schemas
 */
export const TagCreateBodySchema = z.object({
  name: z.string().min(1).max(30),
});

/**
 * Response Schemas
 */
export const TagResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(), // ISO datetime string
});

export const TagWithCountResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.string(), // ISO datetime string
  postCount: z.number(),
});

export const TagListResponseSchema = z.object({
  tags: z.array(z.union([TagResponseSchema, TagWithCountResponseSchema])),
});

export const TagCreateResponseSchema = z.object({
  tag: TagResponseSchema,
});

/**
 * Type exports
 */
export type TagIdParam = z.infer<typeof TagIdParamSchema>;
export type TagSearchQuery = z.infer<typeof TagSearchQuerySchema>;
export type TagCreateBody = z.infer<typeof TagCreateBodySchema>;
