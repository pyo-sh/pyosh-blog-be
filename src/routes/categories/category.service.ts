import { asc, eq, isNull, sql } from "drizzle-orm";
import { MySql2Database } from "drizzle-orm/mysql2";
import {
  Category,
  categoryTable,
  NewCategory,
} from "@src/db/schema/categories";
import * as schema from "@src/db/schema/index";
import { postTable } from "@src/db/schema/posts";
import { HttpError } from "@src/errors/http-error";
import { generateSlug, ensureUniqueSlug } from "@src/shared/slug";

/**
 * Category 생성 파라미터
 */
export interface CategoryCreateArgs {
  name: string;
  parentId?: number | null;
  isVisible?: boolean;
}

/**
 * Category 수정 파라미터
 */
export interface CategoryUpdateArgs {
  id: number;
  name?: string;
  parentId?: number | null;
  sortOrder?: number;
  isVisible?: boolean;
}

/**
 * Category 순서 변경 파라미터
 */
export interface CategoryOrderItem {
  id: number;
  sortOrder: number;
}

/**
 * 트리 구조 Category (children 포함)
 */
export interface CategoryTree extends Category {
  children: CategoryTree[];
}

/**
 * Category Service
 */
export class CategoryService {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  /**
   * 카테고리 생성
   * - slug 자동 생성 및 중복 체크
   * - 부모 카테고리 존재 확인
   * - sort_order 자동 부여 (같은 부모 아래 최대값 + 1)
   */
  async createCategory(data: CategoryCreateArgs): Promise<Category> {
    // 1. slug 생성
    let slug = generateSlug(data.name);

    // 2. slug 중복 체크 및 고유 slug 생성
    slug = await ensureUniqueSlug(slug, async (checkSlug) => {
      const [existing] = await this.db
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.slug, checkSlug))
        .limit(1);

      return Boolean(existing);
    });

    // 3. parent_id가 있으면 부모 카테고리 존재 확인
    if (data.parentId) {
      const [parent] = await this.db
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.id, data.parentId))
        .limit(1);

      if (!parent) {
        throw HttpError.badRequest("부모 카테고리가 존재하지 않습니다.");
      }
    }

    // 4. 같은 부모 아래 최대 sort_order 조회하여 +1
    const [maxOrder] = await this.db
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

    // 5. 카테고리 생성
    const newCategory: NewCategory = {
      name: data.name,
      slug,
      parentId: data.parentId ?? null,
      sortOrder,
      isVisible: data.isVisible ?? true,
    };

    const [result] = await this.db.insert(categoryTable).values(newCategory);

    // 6. 생성된 카테고리 조회
    const [category] = await this.db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.id, Number(result.insertId)))
      .limit(1);

    if (!category) {
      throw HttpError.internal("카테고리 생성에 실패했습니다.");
    }

    return category;
  }

  /**
   * 전체 카테고리 트리 조회
   * - flat 리스트를 계층 구조로 변환
   * - is_visible 필터링 옵션 제공 (Public API용)
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

    // 3. flat 리스트 → 트리 구조 변환
    const categoryMap = new Map<number, CategoryTree>();
    const rootCategories: CategoryTree[] = [];

    // 모든 카테고리를 Map에 저장 (children 빈 배열로 초기화)
    filteredCategories.forEach((category) => {
      categoryMap.set(category.id, { ...category, children: [] });
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
   * slug로 카테고리 조회 (하위 카테고리 포함)
   */
  async getCategoryBySlug(slug: string): Promise<CategoryTree> {
    // 1. slug로 카테고리 조회
    const [category] = await this.db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.slug, slug))
      .limit(1);

    if (!category) {
      throw HttpError.notFound("카테고리를 찾을 수 없습니다.");
    }

    // 2. 하위 카테고리 목록 조회
    const children = await this.db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.parentId, category.id))
      .orderBy(asc(categoryTable.sortOrder));

    return {
      ...category,
      children: children.map((c) => ({ ...c, children: [] })),
    };
  }

  /**
   * 카테고리 수정
   * - parent_id 변경 시 순환 참조 방지
   * - name 변경 시 slug는 그대로 유지 (선택적으로 재생성 가능)
   */
  async updateCategory(args: CategoryUpdateArgs): Promise<Category> {
    const { id, name, parentId, sortOrder, isVisible } = args;

    // 1. 카테고리 존재 확인
    const [existing] = await this.db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.id, id))
      .limit(1);

    if (!existing) {
      throw HttpError.notFound("카테고리를 찾을 수 없습니다.");
    }

    // 2. parent_id 변경 시 순환 참조 방지 체크
    if (parentId !== undefined && parentId !== null) {
      // 자기 자신을 부모로 설정하는 경우
      if (parentId === id) {
        throw HttpError.badRequest(
          "자기 자신을 부모 카테고리로 설정할 수 없습니다.",
        );
      }

      // 자신의 하위 카테고리를 부모로 설정하는 경우 체크
      const isDescendant = await this.isDescendantOf(id, parentId);
      if (isDescendant) {
        throw HttpError.badRequest(
          "하위 카테고리를 부모로 설정할 수 없습니다.",
        );
      }

      // 부모 카테고리 존재 확인
      const [parent] = await this.db
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.id, parentId))
        .limit(1);

      if (!parent) {
        throw HttpError.badRequest("부모 카테고리가 존재하지 않습니다.");
      }
    }

    // 3. 변경사항 적용
    const updates: Partial<Category> = {};
    if (name !== undefined) {
      updates.name = name;
      // slug는 유지 (필요시 재생성 옵션 추가 가능)
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

    await this.db
      .update(categoryTable)
      .set(updates)
      .where(eq(categoryTable.id, id));

    // 4. 업데이트된 카테고리 조회
    const [updated] = await this.db
      .select()
      .from(categoryTable)
      .where(eq(categoryTable.id, id))
      .limit(1);

    if (!updated) {
      throw HttpError.internal("카테고리 수정에 실패했습니다.");
    }

    return updated;
  }

  /**
   * 카테고리 순서 일괄 변경 (트랜잭션)
   */
  async updateCategoryOrder(items: CategoryOrderItem[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(categoryTable)
          .set({ sortOrder: item.sortOrder })
          .where(eq(categoryTable.id, item.id));
      }
    });
  }

  /**
   * 카테고리 삭제
   * - 하위 카테고리 존재 시 삭제 불가
   * - 연결된 게시글 존재 시 삭제 불가
   */
  async deleteCategory(id: number): Promise<void> {
    // 1. 하위 카테고리 존재 여부 확인
    const [childCount] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(categoryTable)
      .where(eq(categoryTable.parentId, id));

    if (childCount && childCount.count > 0) {
      throw HttpError.conflict("하위 카테고리가 존재하여 삭제할 수 없습니다.");
    }

    // 2. 게시글 존재 여부 확인
    const [postCount] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(postTable)
      .where(eq(postTable.categoryId, id));

    if (postCount && postCount.count > 0) {
      throw HttpError.conflict(
        "해당 카테고리에 게시글이 존재하여 삭제할 수 없습니다.",
      );
    }

    // 3. 카테고리 삭제
    await this.db.delete(categoryTable).where(eq(categoryTable.id, id));
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
