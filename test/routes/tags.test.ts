import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestApp, cleanup, injectAuth } from "@test/helpers/app";
import { seedAdmin, seedCategory, truncateAll } from "@test/helpers/seed";
import { db } from "@src/db/client";
import { postTable } from "@src/db/schema";

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

  describe("GET /api/tags", () => {
    it("공개 발행 게시글 기준 태그 목록 + postCount 반환", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Post One",
          contentMd: "# One",
          categoryId: category.id,
          status: "published",
          visibility: "public",
          tags: ["react", "typescript"],
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Post Two",
          contentMd: "# Two",
          categoryId: category.id,
          status: "published",
          visibility: "public",
          tags: ["react"],
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Private Post",
          contentMd: "# Private",
          categoryId: category.id,
          status: "published",
          visibility: "private",
          tags: ["secret-tag"],
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Draft Post",
          contentMd: "# Draft",
          categoryId: category.id,
          status: "draft",
          visibility: "public",
          tags: ["draft-tag"],
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/tags",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.tags).toEqual([
        { id: expect.any(Number), name: "react", slug: "react", postCount: 2 },
        {
          id: expect.any(Number),
          name: "typescript",
          slug: "typescript",
          postCount: 1,
        },
      ]);
    });

    it("soft-delete 된 게시글 태그는 postCount 집계에서 제외", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Post One",
          contentMd: "# One",
          categoryId: category.id,
          status: "published",
          visibility: "public",
          tags: ["react", "typescript"],
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Post Two",
          contentMd: "# Two",
          categoryId: category.id,
          status: "published",
          visibility: "public",
          tags: ["react"],
        },
      });

      await db
        .update(postTable)
        .set({ deletedAt: new Date() })
        .where(eq(postTable.title, "Post One"));

      const response = await app.inject({
        method: "GET",
        url: "/api/tags",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.tags).toEqual([
        { id: expect.any(Number), name: "react", slug: "react", postCount: 1 },
      ]);
    });
  });
});
