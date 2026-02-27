import { z } from "zod";
import { PaginationMetaSchema } from "@src/schemas/common";

const isAllowedThumbnailUrl = (value: string): boolean => {
  if (value.startsWith("/uploads/")) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const ThumbnailUrlInputSchema = z
  .string()
  .trim()
  .nullable()
  .transform((value) => (value === "" ? null : value))
  .refine((value) => value === null || isAllowedThumbnailUrl(value), {
    message: "thumbnailUrl must be /uploads/... or http(s) URL",
  });

/**
 * Path Parameter Schemas
 */
export const PostSlugParamSchema = z.object({
  slug: z.string().min(1),
});

export const PostIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Query Parameter Schemas
 */
export const PostListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  categoryId: z.coerce.number().int().positive().optional(),
  tagSlug: z.string().min(1).optional(),
  q: z.string().min(1).max(200).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  sort: z
    .enum(["published_at", "created_at"])
    .optional()
    .default("published_at"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  includeDeleted: z.coerce.boolean().optional().default(false),
});

export const AdminPostListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  categoryId: z.coerce.number().int().positive().optional(),
  tagSlug: z.string().min(1).optional(),
  q: z.string().min(1).max(200).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  sort: z.enum(["published_at", "created_at"]).optional().default("created_at"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  includeDeleted: z.coerce.boolean().optional().default(false),
});

/**
 * Request Body Schemas
 */
export const CreatePostBodySchema = z.object({
  title: z.string().min(1).max(200),
  contentMd: z.string().min(1),
  categoryId: z.number().int().positive(),
  thumbnailUrl: ThumbnailUrlInputSchema.optional(),
  visibility: z.enum(["public", "private"]).optional().default("public"),
  status: z
    .enum(["draft", "published", "archived"])
    .optional()
    .default("draft"),
  tags: z.array(z.string().min(1).max(30)).optional(),
  publishedAt: z.string().datetime().optional(),
});

export const UpdatePostBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  contentMd: z.string().min(1).optional(),
  categoryId: z.number().int().positive().optional(),
  thumbnailUrl: ThumbnailUrlInputSchema.optional(),
  visibility: z.enum(["public", "private"]).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  tags: z.array(z.string().min(1).max(30)).optional(),
  publishedAt: z.string().datetime().optional(),
});

/**
 * Response Schemas
 */
export const PostTagSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
});

export const PostCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
});

export const PostDetailSchema = z.object({
  id: z.number(),
  categoryId: z.number(),
  title: z.string(),
  slug: z.string(),
  contentMd: z.string(),
  thumbnailUrl: z.string().nullable(),
  visibility: z.enum(["public", "private"]),
  status: z.enum(["draft", "published", "archived"]),
  publishedAt: z.string().nullable(), // ISO datetime string
  createdAt: z.string(), // ISO datetime string
  updatedAt: z.string(), // ISO datetime string
  deletedAt: z.string().nullable(), // ISO datetime string
  category: PostCategorySchema,
  tags: z.array(PostTagSchema),
});

export const PostNavigationSchema = z.object({
  slug: z.string(),
  title: z.string(),
});

export const PostListResponseSchema = z.object({
  data: z.array(PostDetailSchema),
  meta: PaginationMetaSchema,
});

export const PostDetailResponseSchema = z.object({
  post: PostDetailSchema,
});

export const PostDetailWithNavigationResponseSchema = z.object({
  post: PostDetailSchema,
  prevPost: PostNavigationSchema.nullable(),
  nextPost: PostNavigationSchema.nullable(),
});

/**
 * Type exports
 */
export type PostSlugParam = z.infer<typeof PostSlugParamSchema>;
export type PostIdParam = z.infer<typeof PostIdParamSchema>;
export type PostListQuery = z.infer<typeof PostListQuerySchema>;
export type AdminPostListQuery = z.infer<typeof AdminPostListQuerySchema>;
export type CreatePostBody = z.infer<typeof CreatePostBodySchema>;
export type UpdatePostBody = z.infer<typeof UpdatePostBodySchema>;
