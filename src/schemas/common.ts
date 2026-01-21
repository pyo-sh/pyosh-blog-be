import { z } from "zod";

/**
 * 에러 응답 스키마
 */
export const ErrorResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * 페이지네이션 쿼리 스키마
 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * 페이지네이션 메타 스키마
 */
export const PaginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
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
  id: z.coerce.number().int().positive(),
});

export type IdParam = z.infer<typeof IdParamSchema>;
