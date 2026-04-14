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
  slug: z.string().min(1).describe("게시글 고유 슬러그"),
});

export const PostIdParamSchema = z.object({
  id: z.coerce.number().int().positive().describe("게시글 고유 ID"),
});

/**
 * Query Parameter Schemas
 */
export const PostListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1).describe("페이지 번호"),
  limit: z.coerce.number().int().positive().max(100).optional().default(10).describe("페이지당 항목 수 (최대 100)"),
  categoryId: z.coerce.number().int().positive().optional().describe("카테고리 ID로 필터"),
  tagSlug: z.string().min(1).optional().describe("태그 슬러그로 필터"),
  q: z.string().min(1).max(200).optional().describe("검색어"),
  filter: z
    .enum(["title_content", "title", "content", "tag", "category", "comment"])
    .optional()
    .default("title_content")
    .describe("검색 대상 필드"),
  status: z.enum(["draft", "published", "archived"]).optional().describe("게시 상태 필터"),
  visibility: z.enum(["public", "private"]).optional().describe("공개 범위 필터"),
  sort: z
    .enum(["published_at", "created_at"])
    .optional()
    .default("published_at")
    .describe("정렬 기준 필드"),
  order: z.enum(["asc", "desc"]).optional().default("desc").describe("정렬 방향"),
  includeDeleted: z.coerce.boolean().optional().default(false).describe("삭제된 게시글 포함 여부"),
});

export const AdminPostListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1).describe("페이지 번호"),
  limit: z.coerce.number().int().positive().max(100).optional().default(20).describe("페이지당 항목 수 (최대 100)"),
  categoryId: z.coerce.number().int().positive().optional().describe("카테고리 ID로 필터"),
  tagSlug: z.string().min(1).optional().describe("태그 슬러그로 필터"),
  q: z.string().min(1).max(200).optional().describe("검색어"),
  status: z.enum(["draft", "published", "archived"]).optional().describe("게시 상태 필터"),
  visibility: z.enum(["public", "private"]).optional().describe("공개 범위 필터"),
  sort: z
    .enum(["published_at", "created_at", "totalPageviews", "commentCount"])
    .optional()
    .default("created_at")
    .describe("정렬 기준 필드"),
  order: z.enum(["asc", "desc"]).optional().default("desc").describe("정렬 방향"),
  includeDeleted: z.coerce.boolean().optional().default(false).describe("삭제된 게시글 포함 여부"),
});

/**
 * Request Body Schemas
 */
export const CreatePostBodySchema = z.object({
  title: z.string().min(1).max(200).describe("게시글 제목"),
  contentMd: z.string().min(1).describe("마크다운 본문"),
  categoryId: z.number().int().positive().describe("카테고리 ID"),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .optional()
    .describe("게시글 요약 (최대 200자, null 허용)"),
  description: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .nullable()
    .optional()
    .describe("SEO 메타 설명 (최대 300자, null 허용)"),
  thumbnailUrl: ThumbnailUrlInputSchema.optional().describe("썸네일 URL (/uploads/... 또는 http(s) URL)"),
  visibility: z.enum(["public", "private"]).optional().default("public").describe("공개 범위"),
  status: z
    .enum(["draft", "published", "archived"])
    .optional()
    .default("draft")
    .describe("게시 상태"),
  commentStatus: z
    .enum(["open", "locked", "disabled"])
    .optional()
    .default("open")
    .describe("댓글 허용 상태"),
  isPinned: z.boolean().optional().default(false).describe("상단 고정 여부"),
  tags: z.array(z.string().min(1).max(30)).optional().describe("태그 이름 배열"),
  publishedAt: z.string().datetime().optional().describe("발행일 (ISO 8601)"),
});

export const UpdatePostBodySchema = z.object({
  title: z.string().min(1).max(200).optional().describe("게시글 제목"),
  contentMd: z.string().min(1).optional().describe("마크다운 본문"),
  categoryId: z.number().int().positive().optional().describe("카테고리 ID"),
  summary: z.string().trim().min(1).max(200).nullable().optional().describe("게시글 요약"),
  description: z.string().trim().min(1).max(300).nullable().optional().describe("SEO 메타 설명"),
  thumbnailUrl: ThumbnailUrlInputSchema.optional().describe("썸네일 URL"),
  visibility: z.enum(["public", "private"]).optional().describe("공개 범위"),
  status: z.enum(["draft", "published", "archived"]).optional().describe("게시 상태"),
  commentStatus: z.enum(["open", "locked", "disabled"]).optional().describe("댓글 허용 상태"),
  isPinned: z.boolean().optional().describe("상단 고정 여부"),
  tags: z.array(z.string().min(1).max(30)).optional().describe("태그 이름 배열 (전체 덮어쓰기)"),
  publishedAt: z.string().datetime().optional().describe("발행일 (ISO 8601)"),
});

export const BulkPostActionBodySchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1).max(100).describe("대상 게시글 ID 배열 (최대 100개)"),
    action: z.enum(["update", "soft_delete", "restore", "hard_delete"]).describe("수행할 작업"),
    categoryId: z.number().int().positive().optional().describe("이동할 카테고리 ID (action=update 시 사용)"),
    commentStatus: z.enum(["open", "locked", "disabled"]).optional().describe("변경할 댓글 상태 (action=update 시 사용)"),
  })
  .refine(
    (data) =>
      data.action !== "update" ||
      data.categoryId !== undefined ||
      data.commentStatus !== undefined,
    { message: "action=update requires at least one of categoryId or commentStatus" },
  )
  .refine(
    (data) =>
      data.action === "update" ||
      (data.categoryId === undefined && data.commentStatus === undefined),
    { message: "categoryId and commentStatus are only valid for action=update" },
  );

/**
 * Response Schemas
 */
export const PostTagSchema = z.object({
  id: z.number().describe("태그 ID"),
  name: z.string().describe("태그 이름"),
  slug: z.string().describe("태그 슬러그"),
});

export const PostCategorySchema = z.object({
  id: z.number().describe("카테고리 ID"),
  name: z.string().describe("카테고리 이름"),
  slug: z.string().describe("카테고리 슬러그"),
});

const PostAncestorSchema = z.object({
  name: z.string().describe("상위 카테고리 이름"),
  slug: z.string().describe("상위 카테고리 슬러그"),
});

export const PostDetailCategorySchema = PostCategorySchema.extend({
  ancestors: z.array(PostAncestorSchema).describe("상위 카테고리 목록 (루트부터 순서대로)"),
});

const PostBaseFields = {
  id: z.number().describe("게시글 ID"),
  categoryId: z.number().describe("카테고리 ID"),
  title: z.string().describe("게시글 제목"),
  slug: z.string().describe("게시글 슬러그"),
  summary: z.string().nullable().describe("게시글 요약"),
  description: z.string().nullable().describe("SEO 메타 설명"),
  thumbnailUrl: z.string().nullable().describe("썸네일 URL"),
  visibility: z.enum(["public", "private"]).describe("공개 범위"),
  status: z.enum(["draft", "published", "archived"]).describe("게시 상태"),
  commentStatus: z.enum(["open", "locked", "disabled"]).describe("댓글 허용 상태"),
  isPinned: z.boolean().describe("상단 고정 여부"),
  publishedAt: z.string().nullable().describe("발행일 (ISO 8601)"),
  contentModifiedAt: z.string().nullable().describe("본문 최종 수정일 (ISO 8601)"),
  createdAt: z.string().describe("생성일 (ISO 8601)"),
  updatedAt: z.string().describe("수정일 (ISO 8601)"),
  deletedAt: z.string().nullable().describe("삭제일 (ISO 8601, soft delete)"),
  tags: z.array(PostTagSchema).describe("태그 목록"),
  totalPageviews: z.number().describe("누적 조회수"),
  commentCount: z.number().describe("댓글 수"),
};

export const PostDetailSchema = z.object({
  ...PostBaseFields,
  contentMd: z.string().describe("마크다운 본문"),
  category: PostDetailCategorySchema,
});

export const PostListItemSchema = z.object({
  ...PostBaseFields,
  category: PostCategorySchema,
});

export const PostNavigationSchema = z.object({
  slug: z.string().describe("이전/다음 게시글 슬러그"),
  title: z.string().describe("이전/다음 게시글 제목"),
});

export const PostSlugsResponseSchema = z.object({
  slugs: z.array(
    z.object({
      slug: z.string().describe("게시글 슬러그"),
      updatedAt: z.string().describe("최종 수정일 (ISO 8601)"),
    }),
  ).describe("발행된 게시글 슬러그 목록"),
});

export const PostListResponseSchema = z.object({
  data: z.array(PostListItemSchema),
  meta: PaginationMetaSchema,
});

export const PostDetailResponseSchema = z.object({
  post: PostDetailSchema,
});

export const PostDetailWithNavigationResponseSchema = z.object({
  post: PostDetailSchema,
  prevPost: PostNavigationSchema.nullable().describe("이전 게시글 (없으면 null)"),
  nextPost: PostNavigationSchema.nullable().describe("다음 게시글 (없으면 null)"),
});

export const PinnedPostCountResponseSchema = z.object({
  pinnedCount: z.number().int().nonnegative().describe("삭제되지 않은 pinned 게시글 수"),
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
export type BulkPostActionBody = z.infer<typeof BulkPostActionBodySchema>;
