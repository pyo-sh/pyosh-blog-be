import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import {
  assetCategoryTable,
  assetTable,
  type Asset,
  type AssetCategory,
  type NewAssetCategory,
} from "@src/db/schema/assets";
import * as schema from "@src/db/schema/index";
import { HttpError } from "@src/errors/http-error";
import {
  FileStorageService,
  type BufferedFile,
} from "@src/services/file-storage.service";
import {
  buildPaginatedResponse,
  calculateOffset,
  type PaginatedResponse,
} from "@src/shared/pagination";
import { toUploadUrl, UPLOADS_URL_PREFIX } from "@src/shared/uploads";

export const DEFAULT_ASSET_CATEGORIES = [
  { key: "thumbnail", name: "썸네일", sortOrder: 0 },
  { key: "default", name: "기본", sortOrder: 1 },
  { key: "uncategorized", name: "미분류", sortOrder: 2 },
] as const;

export type DefaultAssetCategoryKey =
  (typeof DEFAULT_ASSET_CATEGORIES)[number]["key"];

export interface AssetCategoryResponse {
  id: number;
  key: string | null;
  name: string;
  sortOrder: number;
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetCategoryArgs {
  name: string;
}

export interface UpdateAssetCategoryArgs {
  id: number;
  name?: string;
  sortOrder?: number;
}

export interface UpdateAssetArgs {
  id: number;
  displayName?: string | null;
  categoryId?: number;
}

export interface BulkUpdateAssetCategoryArgs {
  ids: number[];
  categoryId: number;
}

export interface AssetUploadMetadata {
  displayName?: string | null;
  categoryId?: number;
}

/**
 * 업로드된 Asset 응답
 */
export interface UploadedAsset {
  id: number;
  url: string;
  displayName: string | null;
  category: AssetCategoryResponse;
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
  categoryId?: number;
  q?: string;
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
   * @param buffered 미리 버퍼링된 파일 데이터
   * @param metadata 파일별 표시명/카테고리 메타데이터
   * @returns 생성된 asset 정보
   */
  async uploadAsset(
    buffered: BufferedFile,
    metadata: AssetUploadMetadata = {},
  ): Promise<UploadedAsset> {
    const categoryId =
      metadata.categoryId ?? (await this.getDefaultCategoryId("default"));
    const displayName = this.normalizeDisplayName(metadata.displayName);

    await this.assertAssetCategoryExists(categoryId);

    // 1. 파일 저장 (크기/타입 검증 포함, 이미지 크기 추출)
    const { storageKey, mimeType, sizeBytes, width, height } =
      await this.fileStorage.saveFile(buffered);

    // 2. DB 레코드 생성
    const [asset] = await this.db
      .insert(assetTable)
      .values({
        categoryId,
        displayName,
        storageProvider: "local",
        storageKey,
        mimeType,
        sizeBytes,
        width: width ?? null,
        height: height ?? null,
      })
      .$returningId();

    // 3. 생성된 asset 조회 (전체 정보)
    const createdAsset = await this.getAssetById(asset.id);

    return createdAsset;
  }

  /**
   * 다중 파일 업로드
   * @param files 미리 버퍼링된 파일 데이터 배열
   * @param metadata 파일 순서와 매칭되는 메타데이터 배열
   * @returns 생성된 asset 배열
   */
  async uploadAssets(
    files: BufferedFile[],
    metadata: AssetUploadMetadata[] = [],
  ): Promise<UploadedAsset[]> {
    return Promise.all(
      files.map((file, index) => this.uploadAsset(file, metadata[index])),
    );
  }

  /**
   * Asset ID로 조회
   * @param id asset ID
   * @returns asset 정보 (URL 포함)
   */
  async getAssetById(id: number): Promise<UploadedAsset> {
    await this.ensureDefaultCategories();

    const [row] = await this.db
      .select({ asset: assetTable, category: assetCategoryTable })
      .from(assetTable)
      .leftJoin(
        assetCategoryTable,
        eq(assetTable.categoryId, assetCategoryTable.id),
      )
      .where(eq(assetTable.id, id));

    if (!row?.asset) {
      throw HttpError.notFound(`Asset not found: ${id}`);
    }

    if (!row.category) {
      throw HttpError.internal("Asset category not found.");
    }

    return this.toUploadedAsset(row.asset, row.category);
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
      await this.fileStorage.deleteFile(
        asset.url.replace(UPLOADS_URL_PREFIX, ""),
      );
    } catch (error) {
      // 파일 삭제 실패는 로그만 남기고 계속 진행
      console.error(`Failed to delete file: ${asset.url}`, error);
    }

    // 3. DB 레코드 삭제
    await this.db.delete(assetTable).where(eq(assetTable.id, id));
  }

  /**
   * Asset 벌크 삭제 (단일 트랜잭션 DB 삭제, 파일은 best-effort)
   * @param ids asset ID 배열
   */
  async deleteAssets(ids: number[]): Promise<void> {
    if (ids.length === 0) return;

    // 1. 삭제할 asset storageKey 목록 조회 (파일 삭제용)
    const assets = await this.db
      .select({ id: assetTable.id, storageKey: assetTable.storageKey })
      .from(assetTable)
      .where(inArray(assetTable.id, ids));

    // 2. 단일 트랜잭션으로 DB 레코드 삭제
    await this.db.delete(assetTable).where(inArray(assetTable.id, ids));

    // 3. 물리 파일 삭제 (best-effort: 실패 시 로그만 남김)
    await Promise.all(
      assets.map(async (asset) => {
        try {
          await this.fileStorage.deleteFile(asset.storageKey);
        } catch (error) {
          console.error(`Failed to delete file: ${asset.storageKey}`, error);
        }
      }),
    );
  }

  /**
   * Asset 목록 조회 (페이지네이션)
   * @param query 페이지네이션 쿼리
   * @returns 페이지네이션 응답
   */
  async getAssetList(
    query: GetAssetListQuery,
  ): Promise<PaginatedResponse<AssetListItem>> {
    await this.ensureDefaultCategories();

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = calculateOffset(page, limit);
    const where = this.buildAssetListWhere(query);

    const [{ total }] = await this.db
      .select({ total: sql<number>`COUNT(*)` })
      .from(assetTable)
      .where(where);

    const assets = await this.db
      .select({ asset: assetTable, category: assetCategoryTable })
      .from(assetTable)
      .leftJoin(
        assetCategoryTable,
        eq(assetTable.categoryId, assetCategoryTable.id),
      )
      .where(where)
      .orderBy(desc(assetTable.createdAt))
      .limit(limit)
      .offset(offset);

    const data = assets.map((row) => {
      if (!row.category) {
        throw HttpError.internal("Asset category not found.");
      }

      return this.toAssetListItem(row.asset, row.category);
    });

    return buildPaginatedResponse(data, total, page, limit);
  }

  /**
   * 에셋 카테고리 목록 조회
   */
  async getAssetCategories(): Promise<AssetCategoryResponse[]> {
    await this.ensureDefaultCategories();

    const categories = await this.db
      .select()
      .from(assetCategoryTable)
      .orderBy(asc(assetCategoryTable.sortOrder), asc(assetCategoryTable.id));

    return categories.map((category) => this.toAssetCategoryResponse(category));
  }

  /**
   * 사용자 에셋 카테고리 생성
   */
  async createAssetCategory(
    args: CreateAssetCategoryArgs,
  ): Promise<AssetCategoryResponse> {
    await this.ensureDefaultCategories();

    const name = this.normalizeCategoryName(args.name);
    const [maxOrder] = await this.db
      .select({
        max: sql<number>`COALESCE(MAX(${assetCategoryTable.sortOrder}), 0)`,
      })
      .from(assetCategoryTable);

    const [result] = await this.db.insert(assetCategoryTable).values({
      key: null,
      name,
      sortOrder: (maxOrder?.max ?? 0) + 1,
      isProtected: false,
    });

    return await this.getAssetCategoryById(Number(result.insertId));
  }

  /**
   * 에셋 카테고리 수정
   */
  async updateAssetCategory(
    args: UpdateAssetCategoryArgs,
  ): Promise<AssetCategoryResponse> {
    await this.ensureDefaultCategories();

    const [existing] = await this.db
      .select()
      .from(assetCategoryTable)
      .where(eq(assetCategoryTable.id, args.id))
      .limit(1);

    if (!existing) {
      throw HttpError.notFound("Asset category not found.");
    }

    const updates: Partial<NewAssetCategory> = {};
    if (args.name !== undefined) {
      updates.name = this.normalizeCategoryName(args.name);
    }
    if (args.sortOrder !== undefined) {
      updates.sortOrder = args.sortOrder;
    }

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(assetCategoryTable)
        .set(updates)
        .where(eq(assetCategoryTable.id, args.id));
    }

    return await this.getAssetCategoryById(args.id);
  }

  /**
   * 사용자 에셋 카테고리 삭제 후 연결 에셋은 미분류로 이동
   */
  async deleteAssetCategory(id: number): Promise<void> {
    await this.ensureDefaultCategories();

    const uncategorizedId = await this.getDefaultCategoryId("uncategorized");

    await this.db.transaction(async (tx) => {
      const [category] = await tx
        .select()
        .from(assetCategoryTable)
        .where(eq(assetCategoryTable.id, id))
        .limit(1)
        .for("update");

      if (!category) {
        throw HttpError.notFound("Asset category not found.");
      }

      if (category.isProtected) {
        throw HttpError.badRequest(
          "Protected asset categories cannot be deleted.",
        );
      }

      await tx
        .update(assetTable)
        .set({ categoryId: uncategorizedId })
        .where(eq(assetTable.categoryId, id));

      await tx.delete(assetCategoryTable).where(eq(assetCategoryTable.id, id));
    });
  }

  /**
   * 단일 에셋 메타데이터 수정
   */
  async updateAsset(args: UpdateAssetArgs): Promise<UploadedAsset> {
    await this.ensureDefaultCategories();

    const [existing] = await this.db
      .select({ id: assetTable.id })
      .from(assetTable)
      .where(eq(assetTable.id, args.id))
      .limit(1);

    if (!existing) {
      throw HttpError.notFound("Asset not found.");
    }

    const updates: Partial<typeof assetTable.$inferInsert> = {};
    if (args.displayName !== undefined) {
      updates.displayName = this.normalizeDisplayName(args.displayName);
    }
    if (args.categoryId !== undefined) {
      await this.assertAssetCategoryExists(args.categoryId);
      updates.categoryId = args.categoryId;
    }

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(assetTable)
        .set(updates)
        .where(eq(assetTable.id, args.id));
    }

    return await this.getAssetById(args.id);
  }

  /**
   * 여러 에셋의 카테고리 일괄 변경
   */
  async updateAssetsCategory(args: BulkUpdateAssetCategoryArgs): Promise<void> {
    await this.ensureDefaultCategories();
    await this.assertAssetCategoryExists(args.categoryId);

    const uniqueIds = [...new Set(args.ids)];
    if (uniqueIds.length !== args.ids.length) {
      throw HttpError.badRequest("Duplicate asset IDs are not allowed.");
    }

    const existing = await this.db
      .select({ id: assetTable.id })
      .from(assetTable)
      .where(inArray(assetTable.id, uniqueIds));

    if (existing.length !== uniqueIds.length) {
      throw HttpError.notFound("One or more assets not found.");
    }

    await this.db
      .update(assetTable)
      .set({ categoryId: args.categoryId })
      .where(inArray(assetTable.id, uniqueIds));
  }

  private async getAssetCategoryById(
    id: number,
  ): Promise<AssetCategoryResponse> {
    const [category] = await this.db
      .select()
      .from(assetCategoryTable)
      .where(eq(assetCategoryTable.id, id))
      .limit(1);

    if (!category) {
      throw HttpError.notFound("Asset category not found.");
    }

    return this.toAssetCategoryResponse(category);
  }

  private async ensureDefaultCategories(): Promise<void> {
    const defaults = DEFAULT_ASSET_CATEGORIES.map((category) => category.key);
    const existing = await this.db
      .select({ key: assetCategoryTable.key })
      .from(assetCategoryTable)
      .where(inArray(assetCategoryTable.key, defaults));

    const existingKeys = new Set(existing.map((category) => category.key));

    for (const category of DEFAULT_ASSET_CATEGORIES) {
      if (existingKeys.has(category.key)) {
        continue;
      }

      try {
        await this.db.insert(assetCategoryTable).values({
          key: category.key,
          name: category.name,
          sortOrder: category.sortOrder,
          isProtected: true,
        });
      } catch (error) {
        if (!this.isDuplicateEntry(error)) {
          throw error;
        }
      }
    }
  }

  private async getDefaultCategoryId(
    key: DefaultAssetCategoryKey,
  ): Promise<number> {
    await this.ensureDefaultCategories();

    const [category] = await this.db
      .select({ id: assetCategoryTable.id })
      .from(assetCategoryTable)
      .where(eq(assetCategoryTable.key, key))
      .limit(1);

    if (!category) {
      throw HttpError.internal(`Default asset category missing: ${key}`);
    }

    return category.id;
  }

  private async assertAssetCategoryExists(categoryId: number): Promise<void> {
    const [category] = await this.db
      .select({ id: assetCategoryTable.id })
      .from(assetCategoryTable)
      .where(eq(assetCategoryTable.id, categoryId))
      .limit(1);

    if (!category) {
      throw HttpError.badRequest("Asset category not found.");
    }
  }

  private buildAssetListWhere(query: GetAssetListQuery): SQL | undefined {
    const conditions: SQL[] = [];

    if (query.categoryId !== undefined) {
      conditions.push(eq(assetTable.categoryId, query.categoryId));
    }

    const search = query.q?.trim();
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(sql`(
        ${assetTable.displayName} LIKE ${pattern}
        OR ${assetTable.storageKey} LIKE ${pattern}
      )`);
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Asset을 UploadedAsset 형태로 변환
   */
  private toUploadedAsset(
    asset: Asset,
    category: AssetCategory,
  ): UploadedAsset {
    return {
      id: asset.id,
      url: toUploadUrl(asset.storageKey),
      displayName: asset.displayName,
      category: this.toAssetCategoryResponse(category),
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
    };
  }

  /**
   * Asset을 AssetListItem 형태로 변환 (createdAt 포함)
   */
  private toAssetListItem(
    asset: Asset,
    category: AssetCategory,
  ): AssetListItem {
    return {
      ...this.toUploadedAsset(asset, category),
      createdAt: asset.createdAt.toISOString(),
    };
  }

  private toAssetCategoryResponse(
    category: AssetCategory,
  ): AssetCategoryResponse {
    return {
      id: category.id,
      key: category.key,
      name: category.name,
      sortOrder: category.sortOrder,
      isProtected: category.isProtected,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  private normalizeDisplayName(
    value: string | null | undefined,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    if (trimmed.length > 200) {
      throw HttpError.badRequest(
        "Asset displayName cannot exceed 200 characters.",
      );
    }

    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeCategoryName(name: string): string {
    const trimmed = name.trim();

    if (!trimmed) {
      throw HttpError.badRequest("Asset category name is required.");
    }

    return trimmed;
  }

  private isDuplicateEntry(error: unknown): error is { code: string } {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ER_DUP_ENTRY"
    );
  }
}
