import { z } from "zod";

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
