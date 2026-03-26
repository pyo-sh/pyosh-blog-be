import { z } from "zod";

/**
 * 에러 응답 스키마
 */
export const ErrorResponseSchema = z.object({
  statusCode: z.number().describe("HTTP 상태 코드"),
  error: z.string().describe("에러 유형"),
  message: z.string().describe("에러 메시지"),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * 페이지네이션 쿼리 스키마
 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).describe("페이지 번호 (1부터 시작)"),
  limit: z.coerce.number().int().min(1).max(100).default(10).describe("페이지당 항목 수 (최대 100)"),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * 페이지네이션 메타 스키마
 */
export const PaginationMetaSchema = z.object({
  page: z.number().describe("현재 페이지 번호"),
  limit: z.number().describe("페이지당 항목 수"),
  total: z.number().describe("전체 항목 수"),
  totalPages: z.number().describe("전체 페이지 수"),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

/**
 * 페이지네이션 응답 스키마 생성 함수
 */
export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(
  dataSchema: T,
) {
  return z.object({
    data: z.array(dataSchema),
    meta: PaginationMetaSchema,
  });
}

/**
 * ID 파라미터 스키마
 */
export const IdParamSchema = z.object({
  id: z.coerce.number().int().positive().describe("리소스 고유 ID"),
});

export type IdParam = z.infer<typeof IdParamSchema>;

/**
 * Slug 파라미터 스키마
 */
export const SlugParamSchema = z.object({
  slug: z.string().min(1).max(255).describe("URL 슬러그"),
});

export type SlugParam = z.infer<typeof SlugParamSchema>;

/**
 * 성공 응답 스키마
 */
export const SuccessResponseSchema = z.object({
  success: z.literal(true).describe("성공 여부"),
});

export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;
