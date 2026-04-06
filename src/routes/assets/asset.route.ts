import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  assetIdParamSchema,
  assetListQuerySchema,
  assetListResponseSchema,
  uploadAssetsResponseSchema,
  assetResponseSchema,
  bulkDeleteAssetsBodySchema,
  errorResponseSchema,
} from "./asset.schema";
import { AssetService } from "./asset.service";
import { HttpError } from "@src/errors/http-error";
import { FileStorageService } from "@src/services/file-storage.service";
import { requireAdmin } from "@src/hooks/auth.hook";
import { AdminService } from "@src/routes/auth/admin.service";

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

    // POST /api/assets/upload - 파일 업로드 (Admin)
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
            "**CSRF 토큰 필요**: `GET /api/auth/csrf-token`으로 토큰을 발급받아 " +
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

        for await (const file of request.files()) {
          bufferedFiles.push(await FileStorageService.bufferFile(file));
        }

        if (bufferedFiles.length === 0) {
          throw HttpError.badRequest("No file to upload.");
        }

        // 파일 업로드 처리
        const assets = await assetService.uploadAssets(bufferedFiles);

        return reply.status(201).send({
          assets,
        });
      },
    );

    // GET /api/assets - Asset 목록 조회 (Admin)
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

    // GET /api/assets/:id - Asset 메타데이터 조회 (Public, 선택)
    typedFastify.get(
      "/:id",
      {
        schema: {
          tags: ["assets"],
          summary: "Get asset metadata",
          description: "Asset의 메타데이터를 조회합니다. (URL, 크기, 타입 등)",
          params: assetIdParamSchema,
          response: {
            200: assetResponseSchema,
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

    // DELETE /api/assets/bulk - Asset 벌크 삭제 (Admin)
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
            "**CSRF 토큰 필요**: `GET /api/auth/csrf-token`으로 토큰을 발급받아 " +
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

    // DELETE /api/assets/:id - Asset 삭제 (Admin)
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
            "**CSRF 토큰 필요**: `GET /api/auth/csrf-token`으로 토큰을 발급받아 " +
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
