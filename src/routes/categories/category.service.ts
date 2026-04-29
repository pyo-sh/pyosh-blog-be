import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import {
  Category,
  categoryTable,
  NewCategory,
} from "@src/db/schema/categories";
import * as schema from "@src/db/schema/index";
import { postTable } from "@src/db/schema/posts";
import { HttpError } from "@src/errors/http-error";
import {
  ensureUniqueSlug,
  generateUnicodeSlug,
  isBlankSlug,
  needsLegacySlugRepair,
} from "@src/shared/slug";

/**
 * Category 생성 파라미터
 */
export interface CategoryCreateArgs {
  name: string;
  slug?: string;
  parentId?: number | null;
  isVisible?: boolean;
}

/**
 * Category 수정 파라미터
 */
export interface CategoryUpdateArgs {
  id: number;
  name?: string;
  slug?: string;
  parentId?: number | null;
  sortOrder?: number;
  isVisible?: boolean;
}

/**
 * Category 트리 배치 변경 아이템
 */
export interface CategoryTreeItem {
  id: number;
  parentId: number | null;
  sortOrder: number;
}

/**
 * Category 삭제 파라미터
 */
export interface CategoryDeleteArgs {
  id: number;
  action: "move" | "trash";
  moveTo?: number;
}

/**
 * Category 벌크 삭제 파라미터
 */
export interface CategoryBulkDeleteArgs {
  ids: number[];
  action: "move" | "trash";
  moveTo?: number;
}

const MAX_BULK_DELETE_CATEGORIES = 100;

/**
 * 게시글 카운트가 포함된 Category
 */
export interface CategoryWithCounts extends Category {
  publishedPostCount: number;
  totalPostCount: number;
}

/**
 * 트리 구조 Category (children 포함)
 */
export interface CategoryTree extends CategoryWithCounts {
  children: CategoryTree[];
}

/**
 * Category Service
 */
export class CategoryService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * 카테고리 생성
   * - 유니코드 slug 자동 생성 및 중복/legacy 대응
   * - 부모 카테고리 존재 확인
   * - sort_order 자동 부여 (같은 부모 아래 최대값 + 1)
   */
  async createCategory(data: CategoryCreateArgs): Promise<CategoryWithCounts> {
    return await this.db.transaction(async (tx) => {
      if (data.parentId) {
        const [parent] = await tx
          .select()
          .from(categoryTable)
          .where(eq(categoryTable.id, data.parentId))
          .limit(1);

        if (!parent) {
          throw HttpError.badRequest("Parent category not found.");
        }
      }

      const [maxOrder] = await tx
        .select({
          max: sql<number>`COALESCE(MAX(${categoryTable.sortOrder}), 0)`,
        })
        .from(categoryTable)
        .where(
          data.parentId
            ? eq(categoryTable.parentId, data.parentId)
            : isNull(categoryTable.parentId),
        );

      const sortOrder = (maxOrder?.max ?? 0) + 1;
      const newCategory: NewCategory = {
        name: data.name,
        slug: this.buildPendingSlug(),
        parentId: data.parentId ?? null,
        sortOrder,
        isVisible: data.isVisible ?? true,
      };

      const [result] = await tx.insert(categoryTable).values(newCategory);
      const categoryId = Number(result.insertId);
      await this.finalizeCategorySlug(tx, categoryId, data.name, data.slug);

      const [category] = await tx
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.id, categoryId))
        .limit(1);

      if (!category) {
        throw HttpError.internal("Failed to create category.");
      }

      return { ...category, publishedPostCount: 0, totalPostCount: 0 };
    });
  }

  /**
   * 전체 카테고리 트리 조회
   * - flat 리스트를 계층 구조로 변환
   * - is_visible 필터링 옵션 제공 (Public API용)
   * - 각 카테고리에 publishedPostCount / totalPostCount 포함
   */
  async getAllCategoriesTree(includeHidden = false): Promise<CategoryTree[]> {
    // 1. 전체 카테고리 조회 (sortOrder 오름차순)
    const categories = await this.db
      .select()
      .from(categoryTable)
      .orderBy(asc(categoryTable.sortOrder));

    // 2. is_visible 필터링
    const filteredCategories = includeHidden
      ? categories
      : categories.filter((c) => c.isVisible);

    // 3. 카테고리별 게시글 카운트 조회 (categoryId IS NULL인 고아 행 제외)
    const postCounts = await this.db
      .select({
        categoryId: postTable.categoryId,
        publishedPostCount: sql<number>`SUM(CASE WHEN ${postTable.status} = 'published' AND ${postTable.visibility} = 'public' AND ${postTable.deletedAt} IS NULL THEN 1 ELSE 0 END)`,
        totalPostCount: sql<number>`SUM(CASE WHEN ${postTable.deletedAt} IS NULL THEN 1 ELSE 0 END)`,
      })
      .from(postTable)
      .where(isNotNull(postTable.categoryId))
      .groupBy(postTable.categoryId);

    const countMap = new Map(
      postCounts.map((c) => [
        c.categoryId,
        {
          publishedPostCount: Number(c.publishedPostCount),
          totalPostCount: Number(c.totalPostCount),
        },
      ]),
    );

    // 4. flat 리스트 → 트리 구조 변환
    const categoryMap = new Map<number, CategoryTree>();
    const rootCategories: CategoryTree[] = [];

    // 모든 카테고리를 Map에 저장 (children 빈 배열로 초기화)
    filteredCategories.forEach((category) => {
      const counts = countMap.get(category.id) ?? {
        publishedPostCount: 0,
        totalPostCount: 0,
      };
      categoryMap.set(category.id, { ...category, ...counts, children: [] });
    });

    // 부모-자식 관계 설정
    filteredCategories.forEach((category) => {
      const categoryWithChildren = categoryMap.get(category.id);
      if (!categoryWithChildren) return;

      if (category.parentId === null) {
        // 최상위 카테고리
        rootCategories.push(categoryWithChildren);
      } else {
        // 하위 카테고리 - 부모의 children에 추가
        const parent = categoryMap.get(category.parentId);
        if (parent) {
          parent.children.push(categoryWithChildren);
        }
      }
    });

    return rootCategories;
  }

  /**
   * 카테고리 수정
   * - parent_id 변경 시 순환 참조 방지
   * - slug 수동 override 또는 legacy slug 복구 지원
   */
  async updateCategory(args: CategoryUpdateArgs): Promise<CategoryWithCounts> {
    const { id, name, slug, parentId, sortOrder, isVisible } = args;

    return await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.id, id))
        .limit(1);

      if (!existing) {
        throw HttpError.notFound("Category not found.");
      }

      if (parentId !== undefined && parentId !== null) {
        if (parentId === id) {
          throw HttpError.badRequest("A category cannot be its own parent.");
        }

        const isDescendant = await this.isDescendantOf(id, parentId);
        if (isDescendant) {
          throw HttpError.badRequest(
            "Cannot set a descendant category as parent.",
          );
        }

        const [parent] = await tx
          .select()
          .from(categoryTable)
          .where(eq(categoryTable.id, parentId))
          .limit(1);

        if (!parent) {
          throw HttpError.badRequest("Parent category not found.");
        }
      }

      const updates: Partial<NewCategory> = {};
      if (name !== undefined) {
        updates.name = name;
      }
      if (parentId !== undefined) {
        updates.parentId = parentId;
      }
      if (sortOrder !== undefined) {
        updates.sortOrder = sortOrder;
      }
      if (isVisible !== undefined) {
        updates.isVisible = isVisible;
      }

      if (slug !== undefined || needsLegacySlugRepair(existing.slug)) {
        updates.slug = await this.finalizeCategorySlug(
          tx,
          id,
          name ?? existing.name,
          slug,
          id,
        );
      }

      await tx
        .update(categoryTable)
        .set(updates)
        .where(eq(categoryTable.id, id));

      const [updated] = await tx
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.id, id))
        .limit(1);

      if (!updated) {
        throw HttpError.internal("Failed to update category.");
      }

      const [counts] = await tx
        .select({
          publishedPostCount: sql<number>`SUM(CASE WHEN ${postTable.status} = 'published' AND ${postTable.visibility} = 'public' AND ${postTable.deletedAt} IS NULL THEN 1 ELSE 0 END)`,
          totalPostCount: sql<number>`SUM(CASE WHEN ${postTable.deletedAt} IS NULL THEN 1 ELSE 0 END)`,
        })
        .from(postTable)
        .where(eq(postTable.categoryId, id));

      return {
        ...updated,
        publishedPostCount: Number(counts?.publishedPostCount ?? 0),
        totalPostCount: Number(counts?.totalPostCount ?? 0),
      };
    });
  }

  /**
   * 카테고리 트리 배치 변경 (단일 트랜잭션)
   * - parentId와 sortOrder를 동시에 업데이트
   * - 배치의 목표 상태(target state)를 기준으로 순환 참조 검증
   *   (현재 DB 상태 기준으로 검증하면 유효한 부모-자식 위치 교환이 거부됨)
   * - 전체 카테고리 조회를 FOR SHARE 잠금으로 트랜잭션 내에서 수행하여 TOCTOU 방지
   */
  async updateCategoryTree(items: CategoryTreeItem[]): Promise<void> {
    // 1. 중복 ID 검증 (입력 유효성 검사 - 트랜잭션 외부)
    const seenIds = new Set<number>();
    for (const item of items) {
      if (seenIds.has(item.id)) {
        throw HttpError.badRequest(
          `Duplicate category ID ${item.id} in changes.`,
        );
      }
      seenIds.add(item.id);
    }

    // 2. 트랜잭션 내에서 검증 및 배치 업데이트
    await this.db.transaction(async (tx) => {
      // 전체 카테고리 목록을 FOR SHARE 잠금으로 조회
      // (동시 삭제 요청이 TOCTOU로 잘못된 parentId를 허용하지 않도록 방지)
      const allCategories = await tx
        .select({ id: categoryTable.id, parentId: categoryTable.parentId })
        .from(categoryTable)
        .for("share");

      // 현재 DB 상태로 부모 맵 구성
      const targetMap = new Map<number, number | null>(
        allCategories.map((c) => [c.id, c.parentId]),
      );
      const existingIds = new Set(allCategories.map((c) => c.id));

      // item.id 존재 여부 검증 (targetMap 갱신 전에 수행)
      for (const item of items) {
        if (!existingIds.has(item.id)) {
          throw HttpError.badRequest(`Category ${item.id} not found.`);
        }
      }

      // 배치 변경 사항을 반영해 목표 상태 맵 갱신
      for (const item of items) {
        targetMap.set(item.id, item.parentId);
      }

      // 목표 상태에서 각 항목 유효성 검증
      for (const item of items) {
        if (item.parentId === null) continue;

        // 자기 자신을 부모로 설정하는 경우
        if (item.parentId === item.id) {
          throw HttpError.badRequest(
            `Category ${item.id} cannot be its own parent.`,
          );
        }

        // 부모 카테고리 존재 확인
        if (!existingIds.has(item.parentId)) {
          throw HttpError.badRequest(
            `Parent category ${item.parentId} not found.`,
          );
        }

        // 목표 상태에서 순환 참조 여부 확인 (DB 추가 조회 없이 in-memory 탐색)
        let current: number | null = item.parentId;
        const visited = new Set<number>();
        let hasCycle = false;

        while (current !== null) {
          if (current === item.id) {
            hasCycle = true;
            break;
          }
          if (visited.has(current)) break;
          visited.add(current);
          current = targetMap.get(current) ?? null;
        }

        if (hasCycle) {
          throw HttpError.badRequest(
            `Category ${item.id}: cannot set a descendant as parent.`,
          );
        }
      }

      // 일괄 업데이트
      for (const item of items) {
        await tx
          .update(categoryTable)
          .set({ parentId: item.parentId, sortOrder: item.sortOrder })
          .where(eq(categoryTable.id, item.id));
      }
    });
  }

  /**
   * 카테고리 벌크 삭제
   * - 전체 대상 존재 여부와 하위 카테고리 여부를 먼저 검증
   * - action=move: 미삭제 게시글은 moveTo로 이동, soft-deleted 게시글은 categoryId 초기화
   * - action=trash: 미삭제 게시글은 soft delete + categoryId 초기화, soft-deleted 게시글은 categoryId 초기화
   * - 검증/게시글 처리/카테고리 삭제를 단일 트랜잭션으로 수행
   */
  async deleteCategories(args: CategoryBulkDeleteArgs): Promise<void> {
    const { ids, action, moveTo } = args;

    if (ids.length === 0) {
      throw HttpError.badRequest("At least one category ID is required.");
    }

    if (ids.length > MAX_BULK_DELETE_CATEGORIES) {
      throw HttpError.badRequest(
        `Cannot delete more than ${MAX_BULK_DELETE_CATEGORIES} categories at once.`,
      );
    }

    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) {
      throw HttpError.badRequest("Duplicate category IDs are not allowed.");
    }

    if (action === "move" && moveTo == null) {
      throw HttpError.badRequest("moveTo is required when action is move.");
    }

    if (action === "move" && uniqueIds.includes(moveTo!)) {
      throw HttpError.badRequest(
        "moveTo cannot be one of the categories being deleted.",
      );
    }

    await this.db.transaction(async (tx) => {
      const categories = await tx
        .select({ id: categoryTable.id })
        .from(categoryTable)
        .where(inArray(categoryTable.id, uniqueIds))
        .for("update");

      if (categories.length !== uniqueIds.length) {
        throw HttpError.notFound("One or more categories not found.");
      }

      const [childCategory] = await tx
        .select({ id: categoryTable.id })
        .from(categoryTable)
        .where(inArray(categoryTable.parentId, uniqueIds))
        .limit(1);

      if (childCategory) {
        throw HttpError.conflict("Cannot delete category with subcategories.");
      }

      if (action === "move") {
        const [targetCategory] = await tx
          .select({ id: categoryTable.id })
          .from(categoryTable)
          .where(eq(categoryTable.id, moveTo!))
          .limit(1)
          .for("share");

        if (!targetCategory) {
          throw HttpError.badRequest("Target category not found.");
        }

        await tx
          .update(postTable)
          .set({ categoryId: moveTo! })
          .where(
            and(
              inArray(postTable.categoryId, uniqueIds),
              isNull(postTable.deletedAt),
            ),
          );

        await tx
          .update(postTable)
          .set({ categoryId: null })
          .where(
            and(
              inArray(postTable.categoryId, uniqueIds),
              isNotNull(postTable.deletedAt),
            ),
          );
      } else {
        await tx
          .update(postTable)
          .set({ deletedAt: sql`NOW()`, categoryId: null })
          .where(
            and(
              inArray(postTable.categoryId, uniqueIds),
              isNull(postTable.deletedAt),
            ),
          );

        await tx
          .update(postTable)
          .set({ categoryId: null })
          .where(
            and(
              inArray(postTable.categoryId, uniqueIds),
              isNotNull(postTable.deletedAt),
            ),
          );
      }

      await tx
        .delete(categoryTable)
        .where(inArray(categoryTable.id, uniqueIds));
    });
  }

  /**
   * 카테고리 삭제
   * - 하위 카테고리 존재 시 삭제 불가 (409)
   * - action=move: 해당 카테고리의 게시글을 moveTo 카테고리로 이동 후 삭제
   * - action=trash: 해당 카테고리의 게시글을 휴지통(soft delete)으로 이동 후 삭제
   */
  async deleteCategory(args: CategoryDeleteArgs): Promise<void> {
    const { id, action, moveTo } = args;

    // action=move일 때 moveTo 필수 (HTTP 레이어와 무관하게 서비스 레이어에서도 보장)
    if (action === "move" && moveTo == null) {
      throw HttpError.badRequest("moveTo is required when action is move.");
    }

    // 삭제 대상과 이동 대상이 같으면 포스트가 orphaned FK 상태가 됨
    if (action === "move" && moveTo === id) {
      throw HttpError.badRequest(
        "moveTo cannot be the same as the category being deleted.",
      );
    }

    // 단일 트랜잭션: 존재 확인 + 하위 카테고리 확인 + 게시글 처리 + 카테고리 삭제
    await this.db.transaction(async (tx) => {
      // 카테고리 존재 확인 (트랜잭션 내에서 TOCTOU 방지)
      const [existing] = await tx
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.id, id))
        .limit(1);

      if (!existing) {
        throw HttpError.notFound("Category not found.");
      }

      // 하위 카테고리 존재 여부 확인 (트랜잭션 내에서 TOCTOU 방지)
      const [childCount] = await tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(categoryTable)
        .where(eq(categoryTable.parentId, id));

      if (childCount && childCount.count > 0) {
        throw HttpError.conflict("Cannot delete category with subcategories.");
      }

      if (action === "move") {
        // 이동 대상 카테고리 존재 확인
        const [targetCategory] = await tx
          .select()
          .from(categoryTable)
          .where(eq(categoryTable.id, moveTo!))
          .limit(1);

        if (!targetCategory) {
          throw HttpError.badRequest("Target category not found.");
        }

        // 미삭제 게시글: 대상 카테고리로 이동
        await tx
          .update(postTable)
          .set({ categoryId: moveTo! })
          .where(
            and(eq(postTable.categoryId, id), isNull(postTable.deletedAt)),
          );

        // 이미 soft-delete된 게시글: categoryId 초기화 (복구 시 삭제된 카테고리 참조 방지)
        await tx
          .update(postTable)
          .set({ categoryId: null })
          .where(
            and(eq(postTable.categoryId, id), isNotNull(postTable.deletedAt)),
          );
      } else {
        // 미삭제 게시글: soft delete + categoryId 초기화
        await tx
          .update(postTable)
          .set({ deletedAt: sql`NOW()`, categoryId: null })
          .where(
            and(eq(postTable.categoryId, id), isNull(postTable.deletedAt)),
          );
        // 이미 soft delete된 게시글: categoryId만 초기화 (복구 시 유효한 categoryId 보장)
        await tx
          .update(postTable)
          .set({ categoryId: null })
          .where(
            and(eq(postTable.categoryId, id), isNotNull(postTable.deletedAt)),
          );
      }

      // 카테고리 삭제
      await tx.delete(categoryTable).where(eq(categoryTable.id, id));
    });
  }

  private buildPendingSlug(): string {
    return `__pending__${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private async resolveCategorySlug(
    tx: MySql2Database<typeof schema>,
    name: string,
    categoryId: number,
    requestedSlug?: string,
    excludeId?: number,
  ): Promise<string> {
    const preferredSlug =
      requestedSlug !== undefined
        ? this.normalizeRequestedSlug(requestedSlug)
        : generateUnicodeSlug(name);

    if (requestedSlug === undefined && isBlankSlug(preferredSlug)) {
      return await this.resolveFallbackSlug(tx, categoryId, excludeId);
    }

    const existing = await tx
      .select({ id: categoryTable.id })
      .from(categoryTable)
      .where(eq(categoryTable.slug, preferredSlug))
      .limit(1);

    if (existing.length === 0 || existing[0]?.id === excludeId) {
      return preferredSlug;
    }

    if (requestedSlug !== undefined) {
      throw HttpError.badRequest("Slug already exists.");
    }

    return await ensureUniqueSlug(preferredSlug, async (checkSlug) => {
      const duplicate = await tx
        .select({ id: categoryTable.id })
        .from(categoryTable)
        .where(eq(categoryTable.slug, checkSlug))
        .limit(1);

      if (duplicate.length === 0) {
        return false;
      }

      return excludeId === undefined || duplicate[0]?.id !== excludeId;
    });
  }

  private normalizeRequestedSlug(slug: string): string {
    const normalizedSlug = generateUnicodeSlug(slug);

    if (isBlankSlug(normalizedSlug)) {
      throw HttpError.badRequest("Slug cannot be blank after normalization.");
    }

    return normalizedSlug;
  }

  private async resolveFallbackSlug(
    tx: MySql2Database<typeof schema>,
    categoryId: number,
    excludeId?: number,
  ): Promise<string> {
    const baseSlug = String(categoryId);

    return await ensureUniqueSlug(baseSlug, async (checkSlug) => {
      const existing = await tx
        .select({ id: categoryTable.id })
        .from(categoryTable)
        .where(eq(categoryTable.slug, checkSlug))
        .limit(1);

      if (existing.length === 0) {
        return false;
      }

      return excludeId === undefined || existing[0]?.id !== excludeId;
    });
  }

  private async finalizeCategorySlug(
    tx: MySql2Database<typeof schema>,
    categoryId: number,
    name: string,
    requestedSlug?: string,
    excludeId?: number,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const resolvedSlug = await this.resolveCategorySlug(
        tx,
        name,
        categoryId,
        requestedSlug,
        excludeId,
      );

      try {
        await tx
          .update(categoryTable)
          .set({ slug: resolvedSlug })
          .where(eq(categoryTable.id, categoryId));

        return resolvedSlug;
      } catch (error) {
        if (!this.isDuplicateEntry(error)) {
          throw error;
        }

        if (requestedSlug !== undefined) {
          throw HttpError.badRequest("Slug already exists.");
        }
      }
    }

    throw HttpError.internal("Failed to finalize category slug.");
  }

  private isDuplicateEntry(error: unknown): error is { code: string } {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ER_DUP_ENTRY"
    );
  }

  /**
   * 순환 참조 체크: categoryId가 potentialParentId의 하위 카테고리인지 확인
   * @private
   */
  private async isDescendantOf(
    categoryId: number,
    potentialParentId: number,
  ): Promise<boolean> {
    let currentId: number | null = potentialParentId;

    // 부모를 따라 올라가면서 categoryId를 만나는지 확인
    while (currentId !== null) {
      if (currentId === categoryId) {
        return true;
      }

      const [parent] = await this.db
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.id, currentId))
        .limit(1);

      currentId = parent?.parentId ?? null;
    }

    return false;
  }
}
