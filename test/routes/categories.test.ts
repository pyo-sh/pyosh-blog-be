import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, cleanup, injectAuth } from "@test/helpers/app";
import { seedAdmin, seedCategory, truncateAll } from "@test/helpers/seed";

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

  // ===== DELETE /api/categories/:id =====

  describe("DELETE /api/categories/:id", () => {
    it("하위 카테고리 있으면 409", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const parent = await seedCategory({ name: "Parent" });
      await seedCategory({ name: "Child", parentId: parent.id });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/categories/${parent.id}`,
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
        url: `/api/categories/${category.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
