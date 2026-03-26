import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestApp, cleanup, injectAuth } from "@test/helpers/app";
import {
  seedAdmin,
  seedCategory,
  seedPost,
  truncateAll,
} from "@test/helpers/seed";
import { db } from "@src/db/client";
import { postTable } from "@src/db/schema";

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

  // ===== GET /api/categories =====

  describe("GET /api/categories", () => {
    it("빈 목록 → 200 + []", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/categories",
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
        url: "/api/categories",
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
        url: "/api/categories",
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
        url: "/api/categories/some-category",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ===== POST /api/categories =====

  describe("POST /api/categories", () => {
    it("Admin 생성 성공 → 201", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);

      const response = await app.inject({
        method: "POST",
        url: "/api/categories",
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

    it("비인증 → 403", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/categories",
        payload: {
          name: "Unauthorized Category",
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ===== PATCH /api/categories/:id =====

  describe("PATCH /api/categories/:id", () => {
    it("이름 변경", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Original Name" });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/categories/${category.id}`,
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
  });

  // ===== PATCH /api/categories/tree =====

  describe("PATCH /api/categories/tree", () => {
    it("트리 배치 변경 → 200", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const parent = await seedCategory({ name: "Parent" });
      const child = await seedCategory({ name: "Child", parentId: parent.id, sortOrder: 1 });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/categories/tree",
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
        url: "/api/categories/tree",
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
        url: "/api/categories/tree",
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
        url: "/api/categories/tree",
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
        url: "/api/categories/tree",
        headers: { cookie },
        payload: {
          changes: [{ id: a.id, parentId: a.id, sortOrder: 0 }],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ===== DELETE /api/categories/:id =====

  describe("DELETE /api/categories/:id", () => {
    it("하위 카테고리 있으면 409", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const parent = await seedCategory({ name: "Parent" });
      await seedCategory({ name: "Child", parentId: parent.id });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/categories/${parent.id}?action=trash`,
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
        url: `/api/categories/${category.id}?action=trash`,
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
        url: `/api/categories/${category.id}?action=trash`,
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
        url: `/api/categories/${source.id}?action=move&moveTo=${target.id}`,
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
        url: `/api/categories/${category.id}?action=move`,
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
        url: `/api/categories/${category.id}`,
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
        url: `/api/categories/${category.id}?action=move&moveTo=${category.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
