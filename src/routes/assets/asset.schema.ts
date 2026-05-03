import { z } from "zod";
import { PaginationMetaSchema } from "@src/schemas/common";

/**
 * Asset 카테고리 응답 스키마
 */
export const assetCategoryResponseSchema = z.object({
  id: z.number().describe("에셋 카테고리 ID"),
  key: z.string().nullable().describe("보호 기본 카테고리 stable key"),
  name: z.string().describe("에셋 카테고리 이름"),
  sortOrder: z.number().describe("정렬 순서"),
  isProtected: z.boolean().describe("기본 보호 카테고리 여부"),
  createdAt: z.string().describe("생성일 (ISO 8601)"),
  updatedAt: z.string().describe("수정일 (ISO 8601)"),
});

/**
 * Asset 카테고리 생성 요청 스키마
 */
export const createAssetCategoryBodySchema = z.object({
  name: z.string().trim().min(1).max(50).describe("에셋 카테고리 이름"),
});

/**
 * Asset 카테고리 수정 요청 스키마
 */
export const updateAssetCategoryBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .optional()
      .describe("에셋 카테고리 이름"),
    sortOrder: z.number().int().min(0).optional().describe("정렬 순서"),
  })
  .refine((body) => body.name !== undefined || body.sortOrder !== undefined, {
    message: "At least one field is required.",
  });

/**
 * Asset 카테고리 ID 파라미터
 */
export const assetCategoryIdParamSchema = z.object({
  id: z.coerce.number().positive().describe("에셋 카테고리 ID"),
});

/**
 * Asset 카테고리 목록 응답 스키마
 */
export const assetCategoryListResponseSchema = z.object({
  data: z.array(assetCategoryResponseSchema),
});

/**
 * Asset 응답 스키마
 */
export const assetResponseSchema = z.object({
  id: z.number().describe("에셋 ID"),
  url: z.string().describe("에셋 접근 URL"),
  displayName: z.string().nullable().describe("관리용 에셋 별명"),
  category: assetCategoryResponseSchema.describe("에셋 카테고리"),
  mimeType: z.string().describe("MIME 타입 (예: image/jpeg)"),
  sizeBytes: z.number().describe("파일 크기 (바이트)"),
  width: z.number().optional().describe("이미지 너비 (픽셀)"),
  height: z.number().optional().describe("이미지 높이 (픽셀)"),
});

/**
 * Asset 목록 응답 아이템 스키마 (createdAt 포함)
 */
export const assetListItemSchema = assetResponseSchema.extend({
  createdAt: z.string().describe("업로드일 (ISO 8601)"),
});

/**
 * Asset 업로드 응답 (단일)
 */
export const uploadAssetResponseSchema = assetResponseSchema;

/**
 * Asset 업로드 응답 (다중)
 */
export const uploadAssetsResponseSchema = z.object({
  assets: z.array(assetResponseSchema).describe("업로드된 에셋 목록"),
});

/**
 * Asset 목록 쿼리 스키마
 */
export const assetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).describe("페이지 번호"),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("페이지당 항목 수 (최대 100)"),
  categoryId: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe("필터링할 에셋 카테고리 ID"),
  q: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe("별명 또는 파일명 검색어"),
});

/**
 * Asset 목록 응답 스키마
 */
export const assetListResponseSchema = z.object({
  data: z.array(assetListItemSchema),
  meta: PaginationMetaSchema,
});

/**
 * Asset ID 파라미터
 */
export const assetIdParamSchema = z.object({
  id: z.coerce.number().positive().describe("에셋 ID"),
});

/**
 * 단일 Asset 메타데이터 수정 요청 스키마
 */
export const updateAssetBodySchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .optional()
      .describe("관리용 에셋 별명"),
    categoryId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("에셋 카테고리 ID"),
  })
  .refine(
    (body) => body.displayName !== undefined || body.categoryId !== undefined,
    {
      message: "At least one field is required.",
    },
  );

/**
 * Asset 카테고리 벌크 변경 요청 스키마
 */
export const bulkUpdateAssetCategoryBodySchema = z.object({
  ids: z
    .array(z.number().positive())
    .min(1)
    .max(100)
    .describe("카테고리를 변경할 에셋 ID 배열 (최대 100개)"),
  categoryId: z.number().int().positive().describe("변경할 에셋 카테고리 ID"),
});

/**
 * Asset 벌크 삭제 요청 스키마
 */
export const bulkDeleteAssetsBodySchema = z.object({
  ids: z
    .array(z.number().positive())
    .min(1)
    .max(100)
    .describe("삭제할 에셋 ID 배열 (최대 100개)"),
});

/**
 * 에러 응답 스키마
 */
export const errorResponseSchema = z.object({
  statusCode: z.number().describe("HTTP 상태 코드"),
  error: z.string().describe("에러 유형"),
  message: z.string().describe("에러 메시지"),
});
