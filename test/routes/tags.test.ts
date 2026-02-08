import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, cleanup, injectAuth } from "@test/helpers/app";
import { seedAdmin, seedCategory, seedTag, truncateAll } from "@test/helpers/seed";

describe("Tag Routes", () => {
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

  // ===== GET /api/tags =====

  describe("GET /api/tags", () => {
    it("태그 목록 조회 → 200", async () => {
      await seedTag({ name: "react", slug: "react" });
      await seedTag({ name: "typescript", slug: "typescript" });

      const response = await app.inject({
        method: "GET",
        url: "/api/tags",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.tags).toHaveLength(2);
      expect(body.tags.some((t: { name: string }) => t.name === "react")).toBe(
        true,
      );
      expect(
        body.tags.some((t: { name: string }) => t.name === "typescript"),
      ).toBe(true);
    });

    it("keyword 검색 → 매칭 태그만 반환", async () => {
      await seedTag({ name: "react", slug: "react" });
      await seedTag({ name: "vue", slug: "vue" });

      const response = await app.inject({
        method: "GET",
        url: "/api/tags?keyword=react",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.tags).toHaveLength(1);
      expect(body.tags[0].name).toBe("react");
    });
  });

  // ===== 게시글 작성 시 태그 자동 생성 =====

  describe("게시글 작성 시 태그 자동 생성", () => {
    it("tags 배열로 게시글 생성 → 태그 자동 생성 확인", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory({ name: "Test Category" });

      const postResponse = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Test Post with Tags",
          contentMd: "# Hello\n\nThis is a test post.",
          categoryId: category.id,
          visibility: "public",
          status: "published",
          tags: ["nextjs", "typescript"],
          publishedAt: new Date().toISOString(),
        },
      });

      expect(postResponse.statusCode).toBe(201);

      const tagsResponse = await app.inject({
        method: "GET",
        url: "/api/tags",
      });

      expect(tagsResponse.statusCode).toBe(200);

      const body = tagsResponse.json();
      const tagNames = body.tags.map((t: { name: string }) => t.name);
      expect(tagNames).toContain("nextjs");
      expect(tagNames).toContain("typescript");
    });
  });
});
