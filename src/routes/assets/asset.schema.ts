import { z } from "zod";
import { PaginationMetaSchema } from "@src/schemas/common";

/**
 * Asset 응답 스키마
 */
export const assetResponseSchema = z.object({
  id: z.number(),
  url: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/**
 * Asset 목록 응답 아이템 스키마 (createdAt 포함)
 */
export const assetListItemSchema = assetResponseSchema.extend({
  createdAt: z.string(),
});

/**
 * Asset 업로드 응답 (단일)
 */
export const uploadAssetResponseSchema = assetResponseSchema;

/**
 * Asset 업로드 응답 (다중)
 */
export const uploadAssetsResponseSchema = z.object({
  assets: z.array(assetResponseSchema),
});

/**
 * Asset 목록 쿼리 스키마
 */
export const assetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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
  id: z.coerce.number().positive(),
});

/**
 * 에러 응답 스키마
 */
export const errorResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
});
