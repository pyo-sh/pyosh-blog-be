import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createTestApp, cleanup, injectAuth } from "@test/helpers/app";
import {
  seedAdmin,
  seedCategory,
  seedPost,
  truncateAll,
} from "@test/helpers/seed";
import { db } from "@src/db/client";
import { categoryTable, postTable } from "@src/db/schema";

function expectRouteHasOnRequestHook(
  tree: string,
  route: string,
  method: "POST" | "PATCH" | "DELETE",
) {
  const lines = tree.trimEnd().split("\n");
  const routeIndex = lines.findIndex((line) =>
    line.includes(`${route} (${method})`),
  );

  expect(routeIndex).toBeGreaterThanOrEqual(0);
  expect(lines[routeIndex + 1]).toContain("• (onRequest)");
}

describe("Category Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanup(app);
  });

  beforeEach(async () => {
    await truncateAll();
  });

  // ===== GET /categories =====

  describe("GET /categories", () => {
    it("빈 목록 → 200 + []", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/categories",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.categories).toEqual([]);
    });

    it("트리 구조 반환 확인", async () => {
      const parent = await seedCategory({ name: "Parent Category" });
      await seedCategory({ name: "Child Category", parentId: parent.id });

      const response = await app.inject({
        method: "GET",
        url: "/categories",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.categories).toHaveLength(1);
      expect(body.categories[0].name).toBe("Parent Category");
      expect(body.categories[0].children).toHaveLength(1);
      expect(body.categories[0].children[0].name).toBe("Child Category");
    });

    it("publishedPostCount / totalPostCount 포함", async () => {
      const category = await seedCategory({ name: "Category With Posts" });
      await seedPost(category.id, { status: "published", visibility: "public" });
      await seedPost(category.id, { status: "draft", visibility: "public" });

      const response = await app.inject({
        method: "GET",
        url: "/categories",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      const found = body.categories.find(
        (c: { name: string }) => c.name === "Category With Posts",
      );
      expect(found).toBeDefined();
      expect(found.publishedPostCount).toBe(1);
      expect(found.totalPostCount).toBe(2);
    });

    it("slug 단건 조회 경로 제거됨 → 404", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/categories/some-category",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ===== POST /categories =====

  describe("POST /categories", () => {
    it("route에 CSRF onRequest hook 등록", () => {
      const routes = app.printRoutes({
        commonPrefix: false,
        includeHooks: true,
        method: "POST",
      });

      expectRouteHasOnRequestHook(routes, "/categories", "POST");
    });

    it("Admin 생성 성공 → 201", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);

      const response = await app.inject({
        method: "POST",
        url: "/categories",
        headers: { cookie },
        payload: {
          name: "New Category",
          isVisible: true,
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.category).toBeDefined();
      expect(body.category.name).toBe("New Category");
      expect(body.category.slug).toBeDefined();
      expect(body.category.isVisible).toBe(true);
      expect(body.category.publishedPostCount).toBe(0);
      expect(body.category.totalPostCount).toBe(0);
    });

    it("한글 이름은 유니코드 slug로 생성 → 201", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);

      const response = await app.inject({
        method: "POST",
        url: "/categories",
        headers: { cookie },
        payload: {
          name: "일상",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().category.slug).toBe("일상");
    });

    it("자동 생성 slug 충돌 시 readable suffix를 유지 → 201", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);

      const first = await app.inject({
        method: "POST",
        url: "/categories",
        headers: { cookie },
        payload: {
          name: "일상",
        },
      });

      const second = await app.inject({
        method: "POST",
        url: "/categories",
        headers: { cookie },
        payload: {
          name: "일상",
        },
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(first.json().category.slug).toBe("일상");
      expect(second.json().category.slug).toBe("일상-2");
    });

    it("slug를 만들 수 없는 이름은 생성된 id fallback 사용 → 201", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);

      const response = await app.inject({
        method: "POST",
        url: "/categories",
        headers: { cookie },
        payload: {
          name: "😀😀😀",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.category.slug).toBe(String(body.category.id));
    });

    it("수동 slug override를 정규화해 저장 → 201", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);

      const response = await app.inject({
        method: "POST",
        url: "/categories",
        headers: { cookie },
        payload: {
          name: "Manual Slug",
          slug: "  커스텀 Slug!  ",
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().category.slug).toBe("커스텀-slug");
    });

    it("중복 수동 slug override는 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      await seedCategory({ name: "Existing", slug: "중복-slug" });

      const response = await app.inject({
        method: "POST",
        url: "/categories",
        headers: { cookie },
        payload: {
          name: "Another",
          slug: "중복 slug",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Slug already exists");
    });

    it("비인증 → 403", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/categories",
        payload: {
          name: "Unauthorized Category",
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ===== PATCH /categories/:id =====

  describe("PATCH /categories/:id", () => {
    it("route에 CSRF onRequest hook 등록", () => {
      const routes = app.printRoutes({
        commonPrefix: false,
        includeHooks: true,
        method: "PATCH",
      });

      expectRouteHasOnRequestHook(routes, "/categories/:id", "PATCH");
    });

    it("이름 변경", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Original Name" });

      const response = await app.inject({
        method: "PATCH",
        url: `/categories/${category.id}`,
        headers: { cookie },
        payload: {
          name: "Updated Name",
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.category.name).toBe("Updated Name");
      expect(body.category.id).toBe(category.id);
    });

    it("legacy 빈 slug 카테고리를 수정하면 slug를 복구 → 200", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Broken", slug: "" });

      const response = await app.inject({
        method: "PATCH",
        url: `/categories/${category.id}`,
        headers: { cookie },
        payload: {
          name: "복구된 이름",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().category.slug).toBe("복구된-이름");
    });

    it("PATCH 수동 slug override 충돌 시 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      await seedCategory({ name: "Existing", slug: "manual-slug" });
      const category = await seedCategory({ name: "Target", slug: "target-slug" });

      const response = await app.inject({
        method: "PATCH",
        url: `/categories/${category.id}`,
        headers: { cookie },
        payload: {
          slug: "manual slug",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toContain("Slug already exists");
    });
  });

  // ===== PATCH /categories/tree =====

  describe("PATCH /categories/tree", () => {
    it("route에 CSRF onRequest hook 등록", () => {
      const routes = app.printRoutes({
        commonPrefix: false,
        includeHooks: true,
        method: "PATCH",
      });

      expectRouteHasOnRequestHook(routes, "/categories/tree", "PATCH");
    });

    it("트리 배치 변경 → 200", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const parent = await seedCategory({ name: "Parent" });
      const child = await seedCategory({ name: "Child", parentId: parent.id, sortOrder: 1 });

      const response = await app.inject({
        method: "PATCH",
        url: "/categories/tree",
        headers: { cookie },
        payload: {
          changes: [
            { id: parent.id, parentId: null, sortOrder: 1 },
            { id: child.id, parentId: null, sortOrder: 0 },
          ],
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.success).toBe(true);
    });

    it("비인증 → 403", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/categories/tree",
        payload: {
          changes: [{ id: 999999, parentId: null, sortOrder: 0 }],
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it("직접 순환 참조 → 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const a = await seedCategory({ name: "A" });
      const b = await seedCategory({ name: "B", parentId: a.id });

      const response = await app.inject({
        method: "PATCH",
        url: "/categories/tree",
        headers: { cookie },
        payload: {
          changes: [
            { id: a.id, parentId: b.id, sortOrder: 0 },
            { id: b.id, parentId: a.id, sortOrder: 1 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("부모-자식 위치 교환은 허용 → 200", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const a = await seedCategory({ name: "A" });
      const b = await seedCategory({ name: "B", parentId: a.id });

      const response = await app.inject({
        method: "PATCH",
        url: "/categories/tree",
        headers: { cookie },
        payload: {
          changes: [
            { id: b.id, parentId: null, sortOrder: 0 },
            { id: a.id, parentId: b.id, sortOrder: 1 },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("자기 자신을 부모로 설정 → 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const a = await seedCategory({ name: "A" });

      const response = await app.inject({
        method: "PATCH",
        url: "/categories/tree",
        headers: { cookie },
        payload: {
          changes: [{ id: a.id, parentId: a.id, sortOrder: 0 }],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ===== DELETE /categories/bulk =====

  describe("DELETE /categories/bulk", () => {
    it("route에 CSRF onRequest hook 등록", () => {
      const routes = app.printRoutes({
        commonPrefix: false,
        includeHooks: true,
        method: "DELETE",
      });

      expectRouteHasOnRequestHook(routes, "/categories/bulk", "DELETE");
    });

    it("비인증 → 403", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/categories/bulk",
        payload: {
          ids: [1],
          action: "trash",
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it("빈 ids → 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);

      const response = await app.inject({
        method: "DELETE",
        url: "/categories/bulk",
        headers: { cookie },
        payload: {
          ids: [],
          action: "trash",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("중복 ids → 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Duplicate Target" });

      const response = await app.inject({
        method: "DELETE",
        url: "/categories/bulk",
        headers: { cookie },
        payload: {
          ids: [category.id, category.id],
          action: "trash",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("존재하지 않는 ids 포함 → 404 + 기존 카테고리 유지", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Existing Category" });

      const response = await app.inject({
        method: "DELETE",
        url: "/categories/bulk",
        headers: { cookie },
        payload: {
          ids: [category.id, 999999],
          action: "trash",
        },
      });

      expect(response.statusCode).toBe(404);

      const [row] = await db
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.id, category.id));
      expect(row).toBeDefined();
    });

    it("하위 카테고리 포함 시 → 409", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const parent = await seedCategory({ name: "Parent" });
      await seedCategory({ name: "Child", parentId: parent.id });

      const response = await app.inject({
        method: "DELETE",
        url: "/categories/bulk",
        headers: { cookie },
        payload: {
          ids: [parent.id],
          action: "trash",
        },
      });

      expect(response.statusCode).toBe(409);
    });

    it("action=move moveTo 없으면 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Move Source" });

      const response = await app.inject({
        method: "DELETE",
        url: "/categories/bulk",
        headers: { cookie },
        payload: {
          ids: [category.id],
          action: "move",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("action=move moveTo가 존재하지 않는 카테고리면 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Move Source" });

      const response = await app.inject({
        method: "DELETE",
        url: "/categories/bulk",
        headers: { cookie },
        payload: {
          ids: [category.id],
          action: "move",
          moveTo: 999999,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("action=move moveTo가 삭제 대상에 포함되면 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const source = await seedCategory({ name: "Move Source" });
      const target = await seedCategory({ name: "Move Target" });

      const response = await app.inject({
        method: "DELETE",
        url: "/categories/bulk",
        headers: { cookie },
        payload: {
          ids: [source.id, target.id],
          action: "move",
          moveTo: target.id,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("action=trash: 게시글 휴지통 이동 후 삭제 → 204 + DB 검증", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const categoryA = await seedCategory({ name: "Trash Source A" });
      const categoryB = await seedCategory({ name: "Trash Source B" });
      const activePostA = await seedPost(categoryA.id);
      const activePostB = await seedPost(categoryB.id);
      const deletedPost = await seedPost(categoryB.id, {
        deletedAt: new Date(),
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/categories/bulk",
        headers: { cookie },
        payload: {
          ids: [categoryA.id, categoryB.id],
          action: "trash",
        },
      });

      expect(response.statusCode).toBe(204);

      const posts = await db
        .select()
        .from(postTable)
        .where(
          inArray(postTable.id, [
            activePostA.id,
            activePostB.id,
            deletedPost.id,
          ]),
        );
      const postById = new Map(posts.map((post) => [post.id, post]));

      expect(postById.get(activePostA.id)?.deletedAt).not.toBeNull();
      expect(postById.get(activePostA.id)?.categoryId).toBeNull();
      expect(postById.get(activePostB.id)?.deletedAt).not.toBeNull();
      expect(postById.get(activePostB.id)?.categoryId).toBeNull();
      expect(postById.get(deletedPost.id)?.deletedAt).not.toBeNull();
      expect(postById.get(deletedPost.id)?.categoryId).toBeNull();

      const categories = await db
        .select()
        .from(categoryTable)
        .where(inArray(categoryTable.id, [categoryA.id, categoryB.id]));
      expect(categories).toHaveLength(0);
    });

    it("action=move: 게시글 이동 후 삭제 → 204 + DB 검증", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const target = await seedCategory({ name: "Move Target" });
      const categoryA = await seedCategory({ name: "Move Source A" });
      const categoryB = await seedCategory({ name: "Move Source B" });
      const activePostA = await seedPost(categoryA.id);
      const activePostB = await seedPost(categoryB.id);
      const deletedPost = await seedPost(categoryB.id, {
        deletedAt: new Date(),
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/categories/bulk",
        headers: { cookie },
        payload: {
          ids: [categoryA.id, categoryB.id],
          action: "move",
          moveTo: target.id,
        },
      });

      expect(response.statusCode).toBe(204);

      const posts = await db
        .select()
        .from(postTable)
        .where(
          inArray(postTable.id, [
            activePostA.id,
            activePostB.id,
            deletedPost.id,
          ]),
        );
      const postById = new Map(posts.map((post) => [post.id, post]));

      expect(postById.get(activePostA.id)?.categoryId).toBe(target.id);
      expect(postById.get(activePostA.id)?.deletedAt).toBeNull();
      expect(postById.get(activePostB.id)?.categoryId).toBe(target.id);
      expect(postById.get(activePostB.id)?.deletedAt).toBeNull();
      expect(postById.get(deletedPost.id)?.categoryId).toBeNull();
      expect(postById.get(deletedPost.id)?.deletedAt).not.toBeNull();

      const deletedCategories = await db
        .select()
        .from(categoryTable)
        .where(inArray(categoryTable.id, [categoryA.id, categoryB.id]));
      expect(deletedCategories).toHaveLength(0);

      const [targetCategory] = await db
        .select()
        .from(categoryTable)
        .where(eq(categoryTable.id, target.id));
      expect(targetCategory).toBeDefined();
    });
  });

  // ===== DELETE /categories/:id =====

  describe("DELETE /categories/:id", () => {
    it("route에 CSRF onRequest hook 등록", () => {
      const routes = app.printRoutes({
        commonPrefix: false,
        includeHooks: true,
        method: "DELETE",
      });

      expectRouteHasOnRequestHook(routes, "/categories/:id", "DELETE");
    });

    it("하위 카테고리 있으면 409", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const parent = await seedCategory({ name: "Parent" });
      await seedCategory({ name: "Child", parentId: parent.id });

      const response = await app.inject({
        method: "DELETE",
        url: `/categories/${parent.id}?action=trash`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
    });

    it("빈 카테고리 삭제 → 204", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Empty Category" });

      const response = await app.inject({
        method: "DELETE",
        url: `/categories/${category.id}?action=trash`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it("action=trash: 게시글 휴지통 이동 후 삭제 → 204 + DB 검증", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Category With Posts" });
      const post = await seedPost(category.id);

      const response = await app.inject({
        method: "DELETE",
        url: `/categories/${category.id}?action=trash`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);

      const [row] = await db
        .select()
        .from(postTable)
        .where(eq(postTable.id, post.id));
      expect(row?.deletedAt).not.toBeNull();
      expect(row?.categoryId).toBeNull();
    });

    it("action=move: 게시글 이동 후 삭제 → 204 + DB 검증", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const target = await seedCategory({ name: "Target Category" });
      const source = await seedCategory({ name: "Source Category" });
      const post = await seedPost(source.id);

      const response = await app.inject({
        method: "DELETE",
        url: `/categories/${source.id}?action=move&moveTo=${target.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);

      const [row] = await db
        .select()
        .from(postTable)
        .where(eq(postTable.id, post.id));
      expect(row?.categoryId).toBe(target.id);
    });

    it("action=move moveTo 없으면 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Category" });

      const response = await app.inject({
        method: "DELETE",
        url: `/categories/${category.id}?action=move`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it("action 없으면 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Category" });

      const response = await app.inject({
        method: "DELETE",
        url: `/categories/${category.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it("action=move moveTo가 존재하지 않는 카테고리면 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Category" });

      const response = await app.inject({
        method: "DELETE",
        url: `/categories/${category.id}?action=move&moveTo=999999`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it("action=move moveTo가 삭제 대상과 동일하면 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Category" });

      const response = await app.inject({
        method: "DELETE",
        url: `/categories/${category.id}?action=move&moveTo=${category.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
