import { z } from "zod";
import { PaginationMetaSchema } from "@src/schemas/common";

/**
 * Asset 응답 스키마
 */
export const assetResponseSchema = z.object({
  id: z.number().describe("에셋 ID"),
  url: z.string().describe("에셋 접근 URL"),
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
