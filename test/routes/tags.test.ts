import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestApp, cleanup, injectAuth } from "@test/helpers/app";
import { seedAdmin, seedCategory, seedTag, truncateAll } from "@test/helpers/seed";
import { db } from "@src/db/client";
import { postTable, tagTable } from "@src/db/schema";

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

  describe("GET /tags", () => {
    it("게시글이 없으면 빈 배열 반환", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/tags",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ tags: [] });
    });

    it("공개 발행 게시글 기준 태그 목록 + postCount 반환", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await app.inject({
        method: "POST",
        url: "/admin/posts",
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
        url: "/admin/posts",
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
        url: "/admin/posts",
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
        url: "/admin/posts",
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
        url: "/tags",
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
        url: "/admin/posts",
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
        url: "/admin/posts",
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
        url: "/tags",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.tags).toEqual([
        { id: expect.any(Number), name: "react", slug: "react", postCount: 1 },
      ]);
    });

    it("한글 태그는 유니코드 slug로 생성한다", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await app.inject({
        method: "POST",
        url: "/admin/posts",
        headers: { cookie },
        payload: {
          title: "Korean Tag Post",
          contentMd: "# Korean",
          categoryId: category.id,
          status: "published",
          visibility: "public",
          tags: ["한글 태그"],
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/tags",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().tags).toEqual([
        {
          id: expect.any(Number),
          name: "한글 태그",
          slug: "한글-태그",
          postCount: 1,
        },
      ]);
    });

    it("slug를 만들 수 없는 태그는 id fallback slug를 사용한다", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await app.inject({
        method: "POST",
        url: "/admin/posts",
        headers: { cookie },
        payload: {
          title: "Emoji Tag Post",
          contentMd: "# Emoji",
          categoryId: category.id,
          status: "published",
          visibility: "public",
          tags: ["😀"],
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/tags",
      });

      expect(response.statusCode).toBe(200);

      const [tag] = response.json().tags;
      expect(tag.slug).toBe(String(tag.id));
    });

    it("기존 legacy 빈 slug 태그를 재사용하면 slug를 복구한다", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();
      const brokenTag = await seedTag({ name: "일상", slug: "" });

      await app.inject({
        method: "POST",
        url: "/admin/posts",
        headers: { cookie },
        payload: {
          title: "Repair Tag Post",
          contentMd: "# Repair",
          categoryId: category.id,
          status: "published",
          visibility: "public",
          tags: ["일상"],
        },
      });

      const [updatedTag] = await db
        .select()
        .from(tagTable)
        .where(eq(tagTable.id, brokenTag.id));

      expect(updatedTag?.slug).toBe("일상");
    });
  });
});
