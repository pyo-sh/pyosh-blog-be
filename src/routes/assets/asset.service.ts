import { eq, sql, desc } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import type { MultipartFile } from "@fastify/multipart";
import { assetTable, type Asset } from "@src/db/schema/assets";
import * as schema from "@src/db/schema/index";
import { HttpError } from "@src/errors/http-error";
import { FileStorageService } from "@src/services/file-storage.service";
import {
  buildPaginatedResponse,
  calculateOffset,
  type PaginatedResponse,
} from "@src/shared/pagination";

/**
 * 업로드된 Asset 응답
 */
export interface UploadedAsset {
  id: number;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

/**
 * Asset 목록 아이템 (createdAt 포함)
 */
export interface AssetListItem extends UploadedAsset {
  createdAt: string;
}

/**
 * Asset 목록 조회 쿼리
 */
export interface GetAssetListQuery {
  page?: number;
  limit?: number;
}

/**
 * DB 레코드 + 파일 저장을 통합하는 Asset 서비스
 */
export class AssetService {
  constructor(
    private readonly db: MySql2Database<typeof schema>,
    private readonly fileStorage: FileStorageService,
  ) {}

  /**
   * 단일 파일 업로드
   * @param file MultipartFile 객체
   * @returns 생성된 asset 정보
   */
  async uploadAsset(file: MultipartFile): Promise<UploadedAsset> {
    // 1. 파일 저장
    const { storageKey, mimeType, sizeBytes } =
      await this.fileStorage.saveFile(file);

    // 2. DB 레코드 생성
    const [asset] = await this.db
      .insert(assetTable)
      .values({
        storageProvider: "local",
        storageKey,
        mimeType,
        sizeBytes,
      })
      .$returningId();

    // 3. 생성된 asset 조회 (전체 정보)
    const createdAsset = await this.getAssetById(asset.id);

    return createdAsset;
  }

  /**
   * 다중 파일 업로드
   * @param files MultipartFile 배열
   * @returns 생성된 asset 배열
   */
  async uploadAssets(files: MultipartFile[]): Promise<UploadedAsset[]> {
    return Promise.all(files.map((file) => this.uploadAsset(file)));
  }

  /**
   * Asset ID로 조회
   * @param id asset ID
   * @returns asset 정보 (URL 포함)
   */
  async getAssetById(id: number): Promise<UploadedAsset> {
    const [asset] = await this.db
      .select()
      .from(assetTable)
      .where(eq(assetTable.id, id));

    if (!asset) {
      throw HttpError.notFound(`Asset not found: ${id}`);
    }

    return this.toUploadedAsset(asset);
  }

  /**
   * Asset 삭제 (DB + 파일)
   * @param id asset ID
   */
  async deleteAsset(id: number): Promise<void> {
    // 1. DB에서 asset 조회
    const asset = await this.getAssetById(id);

    // 2. 실제 파일 삭제 (실패해도 DB는 삭제)
    try {
      await this.fileStorage.deleteFile(asset.url.replace("/uploads/", ""));
    } catch (error) {
      // 파일 삭제 실패는 로그만 남기고 계속 진행
      console.error(`Failed to delete file: ${asset.url}`, error);
    }

    // 3. DB 레코드 삭제
    await this.db.delete(assetTable).where(eq(assetTable.id, id));
  }

  /**
   * Asset 목록 조회 (페이지네이션)
   * @param query 페이지네이션 쿼리
   * @returns 페이지네이션 응답
   */
  async getAssetList(
    query: GetAssetListQuery,
  ): Promise<PaginatedResponse<AssetListItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = calculateOffset(page, limit);

    const [{ total }] = await this.db
      .select({ total: sql<number>`COUNT(*)` })
      .from(assetTable);

    const assets = await this.db
      .select()
      .from(assetTable)
      .orderBy(desc(assetTable.createdAt))
      .limit(limit)
      .offset(offset);

    const data = assets.map((asset) => this.toAssetListItem(asset));

    return buildPaginatedResponse(data, total, page, limit);
  }

  /**
   * Asset을 UploadedAsset 형태로 변환
   */
  private toUploadedAsset(asset: Asset): UploadedAsset {
    return {
      id: asset.id,
      url: `/uploads/${asset.storageKey}`,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    };
  }

  /**
   * Asset을 AssetListItem 형태로 변환 (createdAt 포함)
   */
  private toAssetListItem(asset: Asset): AssetListItem {
    return {
      ...this.toUploadedAsset(asset),
      createdAt: asset.createdAt.toISOString(),
    };
  }
}
