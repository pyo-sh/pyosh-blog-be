import { FastifyPluginAsync, FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  assetIdParamSchema,
  uploadAssetsResponseSchema,
  assetResponseSchema,
  errorResponseSchema,
} from "./asset.schema";
import { AssetService } from "./asset.service";
import { HttpError } from "@src/errors/http-error";
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
  const assetRoute: FastifyPluginAsync = async (
    fastify: FastifyInstance & { withTypeProvider: () => FastifyInstance },
  ) => {
    const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

    // POST /api/assets/upload - 파일 업로드 (Admin)
    typedFastify.post(
      "/upload",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Upload asset file(s)",
          description:
            "이미지 파일을 업로드합니다. Admin 권한이 필요합니다. 단일 또는 다중 업로드 지원.",
          consumes: ["multipart/form-data"],
          response: {
            201: uploadAssetsResponseSchema,
            400: errorResponseSchema,
            403: errorResponseSchema,
            413: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        // 파일 수신 확인
        const files = await request.files();
        const uploadedFiles = [];

        for await (const file of files) {
          uploadedFiles.push(file);
        }

        if (uploadedFiles.length === 0) {
          throw HttpError.badRequest("업로드할 파일이 없습니다.");
        }

        // 파일 업로드 처리
        const assets = await assetService.uploadAssets(uploadedFiles);

        return reply.status(201).send({
          assets,
        });
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

    // DELETE /api/assets/:id - Asset 삭제 (Admin)
    typedFastify.delete(
      "/:id",
      {
        preHandler: requireAdmin(adminService),
        schema: {
          tags: ["assets"],
          summary: "Delete asset",
          description:
            "Asset을 삭제합니다. Admin 권한이 필요합니다. DB 레코드와 실제 파일 모두 삭제됩니다.",
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
