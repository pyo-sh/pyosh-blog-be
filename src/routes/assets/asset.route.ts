import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  assetCategoryIdParamSchema,
  assetCategoryListResponseSchema,
  assetCategoryResponseSchema,
  assetIdParamSchema,
  assetListQuerySchema,
  assetListResponseSchema,
  uploadAssetsResponseSchema,
  assetResponseSchema,
  bulkUpdateAssetCategoryBodySchema,
  createAssetCategoryBodySchema,
  bulkDeleteAssetsBodySchema,
  errorResponseSchema,
  updateAssetBodySchema,
  updateAssetCategoryBodySchema,
} from "./asset.schema";
import { AssetService, type AssetUploadMetadata } from "./asset.service";
import { HttpError } from "@src/errors/http-error";
import { requireAdmin } from "@src/hooks/auth.hook";
import { AdminService } from "@src/routes/auth/admin.service";
import { FileStorageService } from "@src/services/file-storage.service";

type MultipartFieldMap = Map<string, string[]>;

function appendMultipartField(
  fields: MultipartFieldMap,
  name: string,
  value: unknown,
): void {
  if (typeof value !== "string" && typeof value !== "number") {
    return;
  }

  const values = fields.get(name) ?? [];
  values.push(String(value));
  fields.set(name, values);
}

function parsePositiveInteger(value: string, fieldName: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw HttpError.badRequest(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function parseMetadataJson(value: string): AssetUploadMetadata[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw HttpError.badRequest("metadata must be valid JSON.");
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return entries.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw HttpError.badRequest("metadata entries must be objects.");
    }

    const source = entry as Record<string, unknown>;
    const metadata: AssetUploadMetadata = {};

    if (source.displayName !== undefined && source.displayName !== null) {
      if (typeof source.displayName !== "string") {
        throw HttpError.badRequest("metadata.displayName must be a string.");
      }
      metadata.displayName = source.displayName;
    }

    if (source.categoryId !== undefined) {
      if (
        typeof source.categoryId !== "number" ||
        !Number.isInteger(source.categoryId) ||
        source.categoryId <= 0
      ) {
        throw HttpError.badRequest(
          "metadata.categoryId must be a positive integer.",
        );
      }
      metadata.categoryId = source.categoryId;
    }

    return metadata;
  });
}

function buildUploadMetadata(
  fields: MultipartFieldMap,
  fileCount: number,
): AssetUploadMetadata[] {
  const metadata: AssetUploadMetadata[] = Array.from(
    { length: fileCount },
    () => ({}),
  );
  const metadataField = fields.get("metadata")?.[0];

  if (metadataField) {
    const parsedMetadata = parseMetadataJson(metadataField);
    if (parsedMetadata.length > fileCount) {
      throw HttpError.badRequest("metadata contains more entries than files.");
    }

    parsedMetadata.forEach((entry, index) => {
      metadata[index] = { ...metadata[index], ...entry };
    });
  }

  const displayNames = fields.get("displayName") ?? [];
  displayNames.slice(0, fileCount).forEach((displayName, index) => {
    metadata[index].displayName = displayName;
  });

  const categoryIds = fields.get("categoryId") ?? [];
  categoryIds.slice(0, fileCount).forEach((categoryId, index) => {
    metadata[index].categoryId = parsePositiveInteger(categoryId, "categoryId");
  });

  return metadata;
}

/**
 * Asset 라우트 플러그인
 * AssetService와 AdminService를 의존성으로 받아 라우트 핸들러에서 사용
 */
export function createAssetRoute(
  assetService: AssetService,
  adminService: AdminService,
): FastifyPluginAsync {
  const assetRoute: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // POST /assets/upload - 파일 업로드 (Admin)
    typedFastify.post(
      "/upload",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Upload asset file(s)",
          description:
            "이미지 파일을 업로드합니다. Admin 권한이 필요합니다. 단일 또는 다중 업로드 지원.\n\n" +
            "**Content-Type**: `multipart/form-data`\n\n" +
            "**폼 필드명**: `files`\n\n" +
            "**제한사항**:\n" +
            "- 최대 파일 크기: 10MB\n" +
            "- 최대 동시 업로드: 5개\n" +
            "- 허용 MIME 타입: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`\n\n" +
            "**CSRF 토큰 필요**: `GET /auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          response: {
            201: uploadAssetsResponseSchema,
            400: errorResponseSchema,
            403: errorResponseSchema,
            413: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        // 파일 수신 및 버퍼링
        // multipart 스트림은 iterator 루프 내에서 즉시 소비해야 hang을 방지할 수 있음
        const bufferedFiles = [];
        const fields: MultipartFieldMap = new Map();

        for await (const part of request.parts()) {
          if (part.type === "file") {
            bufferedFiles.push(await FileStorageService.bufferFile(part));
          } else {
            appendMultipartField(fields, part.fieldname, part.value);
          }
        }

        if (bufferedFiles.length === 0) {
          throw HttpError.badRequest("No file to upload.");
        }

        // 파일 업로드 처리
        const assets = await assetService.uploadAssets(
          bufferedFiles,
          buildUploadMetadata(fields, bufferedFiles.length),
        );

        return reply.status(201).send({
          assets,
        });
      },
    );

    // GET /assets - Asset 목록 조회 (Admin)
    typedFastify.get(
      "/",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Get asset list",
          description:
            "에셋 목록을 페이지네이션으로 조회합니다. Admin 권한이 필요합니다.",
          security: [{ cookieAuth: [] }],
          querystring: assetListQuerySchema,
          response: {
            200: assetListResponseSchema,
            400: errorResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const result = await assetService.getAssetList(request.query);

        return reply.status(200).send(result);
      },
    );

    // GET /assets/categories - Asset 카테고리 목록 조회 (Admin)
    typedFastify.get(
      "/categories",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Get asset categories",
          description:
            "에셋 카테고리 목록을 조회합니다. 기본 보호 카테고리를 포함합니다.",
          security: [{ cookieAuth: [] }],
          response: {
            200: assetCategoryListResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (_, reply) => {
        const data = await assetService.getAssetCategories();

        return reply.status(200).send({ data });
      },
    );

    // POST /assets/categories - Asset 카테고리 생성 (Admin)
    typedFastify.post(
      "/categories",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Create asset category",
          description:
            "사용자 에셋 카테고리를 생성합니다. Admin 권한이 필요합니다.",
          security: [{ cookieAuth: [] }],
          body: createAssetCategoryBodySchema,
          response: {
            201: assetCategoryResponseSchema,
            400: errorResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const category = await assetService.createAssetCategory({
          name: request.body.name ?? "",
        });

        return reply.status(201).send(category);
      },
    );

    // PATCH /assets/categories/:id - Asset 카테고리 수정 (Admin)
    typedFastify.patch(
      "/categories/:id",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Update asset category",
          description: "에셋 카테고리 이름 또는 정렬 순서를 수정합니다.",
          security: [{ cookieAuth: [] }],
          params: assetCategoryIdParamSchema,
          body: updateAssetCategoryBodySchema,
          response: {
            200: assetCategoryResponseSchema,
            400: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const category = await assetService.updateAssetCategory({
          id,
          ...request.body,
        });

        return reply.status(200).send(category);
      },
    );

    // DELETE /assets/categories/:id - 사용자 Asset 카테고리 삭제 (Admin)
    typedFastify.delete(
      "/categories/:id",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Delete asset category",
          description:
            "사용자 추가 에셋 카테고리를 삭제하고 연결된 에셋을 미분류로 이동합니다.",
          security: [{ cookieAuth: [] }],
          params: assetCategoryIdParamSchema,
          response: {
            204: z.void(),
            400: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        await assetService.deleteAssetCategory(id);

        return reply.status(204).send();
      },
    );

    // GET /assets/:id - Asset 메타데이터 조회 (Admin)
    typedFastify.get(
      "/:id",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Get asset metadata",
          description:
            "Asset의 메타데이터를 조회합니다. Admin 권한이 필요합니다.",
          security: [{ cookieAuth: [] }],
          params: assetIdParamSchema,
          response: {
            200: assetResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const asset = await assetService.getAssetById(id);

        return reply.status(200).send(asset);
      },
    );

    // PATCH /assets/bulk/category - Asset 카테고리 벌크 변경 (Admin)
    typedFastify.patch(
      "/bulk/category",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Bulk update asset category",
          description:
            "여러 Asset의 카테고리를 한 번에 변경합니다. Admin 권한이 필요합니다.",
          security: [{ cookieAuth: [] }],
          body: bulkUpdateAssetCategoryBodySchema,
          response: {
            204: z.void(),
            400: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        await assetService.updateAssetsCategory({
          ids: request.body.ids ?? [],
          categoryId: request.body.categoryId ?? 0,
        });

        return reply.status(204).send();
      },
    );

    // PATCH /assets/:id - Asset 메타데이터 수정 (Admin)
    typedFastify.patch(
      "/:id",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Update asset metadata",
          description: "Asset의 별명 또는 카테고리를 수정합니다.",
          security: [{ cookieAuth: [] }],
          params: assetIdParamSchema,
          body: updateAssetBodySchema,
          response: {
            200: assetResponseSchema,
            400: errorResponseSchema,
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        const asset = await assetService.updateAsset({ id, ...request.body });

        return reply.status(200).send(asset);
      },
    );

    // DELETE /assets/bulk - Asset 벌크 삭제 (Admin)
    typedFastify.delete(
      "/bulk",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Bulk delete assets",
          description:
            "여러 Asset을 한 번에 삭제합니다. Admin 권한이 필요합니다. DB는 단일 트랜잭션, 파일 삭제는 best-effort.\n\n" +
            "**CSRF 토큰 필요**: `GET /auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          body: bulkDeleteAssetsBodySchema,
          response: {
            204: z.void(),
            400: errorResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { ids } = request.body;
        await assetService.deleteAssets(ids);

        return reply.status(204).send();
      },
    );

    // DELETE /assets/:id - Asset 삭제 (Admin)
    typedFastify.delete(
      "/:id",
      {
        onRequest: fastify.csrfProtection,
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Delete asset",
          description:
            "Asset을 삭제합니다. Admin 권한이 필요합니다. DB 레코드와 실제 파일 모두 삭제됩니다.\n\n" +
            "**CSRF 토큰 필요**: `GET /auth/csrf-token`으로 토큰을 발급받아 " +
            "`x-csrf-token` 헤더에 포함해야 합니다.",
          security: [{ cookieAuth: [] }],
          params: assetIdParamSchema,
          response: {
            204: z.void(),
            403: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params;
        await assetService.deleteAsset(id);

        return reply.status(204).send();
      },
    );

    fastify.log.info("[Asset Routes] Registered");
  };

  return assetRoute;
}
