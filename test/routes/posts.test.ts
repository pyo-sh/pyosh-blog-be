import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, cleanup, injectAuth } from "@test/helpers/app";
import {
  seedAdmin,
  seedCategory,
  seedPost,
  truncateAll,
} from "@test/helpers/seed";

describe("Post Routes", () => {
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

  // ===== POST /api/admin/posts =====

  describe("POST /api/admin/posts", () => {
    it("게시글 생성 성공 (태그 포함) → 201", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "My First Post",
          contentMd: "# Hello\n\nThis is content.",
          categoryId: category.id,
          thumbnailUrl: "/uploads/my-first-post.jpg",
          status: "published",
          tags: ["typescript", "fastify"],
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.post).toBeDefined();
      expect(body.post.title).toBe("My First Post");
      expect(body.post.category.id).toBe(category.id);
      expect(body.post.thumbnailUrl).toBe("/uploads/my-first-post.jpg");
      expect(body.post.tags).toHaveLength(2);
      expect(body.post.tags.map((t: { name: string }) => t.name)).toEqual(
        expect.arrayContaining(["typescript", "fastify"]),
      );
    });

    it("thumbnailUrl 빈 문자열은 null로 저장 → 201", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Post Without Thumbnail",
          contentMd: "# Hello",
          categoryId: category.id,
          thumbnailUrl: "",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.post.thumbnailUrl).toBeNull();
    });

    it("thumbnailUrl에 javascript: 스킴 전달 시 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Invalid Thumbnail URL",
          contentMd: "# Hello",
          categoryId: category.id,
          thumbnailUrl: "javascript:alert(1)",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("필수 필드 누락 (title 없음) → 400", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          contentMd: "# Hello",
          categoryId: category.id,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("비인증 → 403", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        payload: {
          title: "My Post",
          contentMd: "# Hello",
          categoryId: 1,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ===== GET /api/posts =====

  describe("GET /api/posts", () => {
    it("Public 목록 — published + public 게시글만 반환", async () => {
      const category = await seedCategory();

      // published + public → 노출 대상
      await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });
      // draft → 제외
      await seedPost(category.id, { status: "draft", visibility: "public" });
      // private → 제외
      await seedPost(category.id, {
        status: "published",
        visibility: "private",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe("published");
      expect(body.data[0].visibility).toBe("public");
      expect(body.meta).toBeDefined();
    });

    it("페이지네이션 동작 — limit=2, 총 3개 → 2개 반환", async () => {
      const category = await seedCategory();

      for (let i = 0; i < 3; i++) {
        await seedPost(category.id, {
          status: "published",
          visibility: "public",
          publishedAt: new Date(Date.now() - i * 1000),
        });
      }

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?page=1&limit=2",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.meta).toBeDefined();
    });

    it("카테고리 필터링 — categoryId 쿼리로 특정 카테고리 게시글만 반환", async () => {
      const cat1 = await seedCategory({ name: "Category A" });
      const cat2 = await seedCategory({ name: "Category B" });

      await seedPost(cat1.id, { status: "published", visibility: "public" });
      await seedPost(cat2.id, { status: "published", visibility: "public" });

      const response = await app.inject({
        method: "GET",
        url: `/api/posts?categoryId=${cat1.id}`,
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].category.id).toBe(cat1.id);
    });

    it("키워드 검색 — q 파라미터로 제목 매칭", async () => {
      const category = await seedCategory();

      await seedPost(category.id, {
        title: "TypeScript Deep Dive",
        contentMd: "# TS\n\nThis is about TypeScript.",
        status: "published",
        visibility: "public",
      });
      await seedPost(category.id, {
        title: "React Hooks Guide",
        contentMd: "# React\n\nThis is about React.",
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?q=TypeScript",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("TypeScript Deep Dive");
    });

    it("키워드 검색 — q 파라미터로 본문 매칭", async () => {
      const category = await seedCategory();

      await seedPost(category.id, {
        title: "Post A",
        contentMd: "# A\n\nDrizzle ORM is great.",
        status: "published",
        visibility: "public",
      });
      await seedPost(category.id, {
        title: "Post B",
        contentMd: "# B\n\nFastify is fast.",
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?q=Drizzle",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("Post A");
    });

    it("키워드 검색 + 카테고리 필터 조합", async () => {
      const cat1 = await seedCategory({ name: "Category A" });
      const cat2 = await seedCategory({ name: "Category B" });

      await seedPost(cat1.id, {
        title: "Fastify Tutorial",
        contentMd: "# Fastify in cat1",
        status: "published",
        visibility: "public",
      });
      await seedPost(cat2.id, {
        title: "Fastify Advanced",
        contentMd: "# Fastify in cat2",
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/posts?q=Fastify&categoryId=${cat1.id}`,
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("Fastify Tutorial");
      expect(body.data[0].category.id).toBe(cat1.id);
    });

    it("태그 필터링 — tagSlug 쿼리로 특정 태그 게시글만 반환", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "TypeScript Post",
          contentMd: "# TS",
          categoryId: category.id,
          status: "published",
          visibility: "public",
          tags: ["typescript"],
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "React Post",
          contentMd: "# React",
          categoryId: category.id,
          status: "published",
          visibility: "public",
          tags: ["react"],
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?tagSlug=typescript",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("TypeScript Post");
      expect(body.data[0].tags.map((t: { slug: string }) => t.slug)).toContain(
        "typescript",
      );
    });
  });

  // ===== GET /api/posts/:slug =====

  describe("GET /api/posts/:slug", () => {
    it("상세 조회 + 이전/다음 네비게이션", async () => {
      const category = await seedCategory();
      const now = Date.now();

      const past = await seedPost(category.id, {
        title: "Past Post",
        status: "published",
        visibility: "public",
        publishedAt: new Date(now - 7200000), // 2시간 전
      });
      const current = await seedPost(category.id, {
        title: "Current Post",
        status: "published",
        visibility: "public",
        publishedAt: new Date(now - 3600000), // 1시간 전
      });
      const future = await seedPost(category.id, {
        title: "Future Post",
        status: "published",
        visibility: "public",
        publishedAt: new Date(now), // 현재
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/posts/${current.slug}`,
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.post.slug).toBe(current.slug);
      expect(body.prevPost).not.toBeNull();
      expect(body.prevPost.slug).toBe(past.slug);
      expect(body.nextPost).not.toBeNull();
      expect(body.nextPost.slug).toBe(future.slug);
    });

    it("존재하지 않는 slug → 404", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/posts/not-existing-slug",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ===== PATCH /api/admin/posts/:id =====

  describe("PATCH /api/admin/posts/:id", () => {
    it("수정 성공 (태그 변경 포함) → 200", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "PATCH",
        url: `/api/admin/posts/${post.id}`,
        headers: { cookie },
        payload: {
          title: "Updated Title",
          thumbnailUrl: "https://cdn.example.com/updated.jpg",
          tags: ["updated-tag"],
        },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.post.title).toBe("Updated Title");
      expect(body.post.thumbnailUrl).toBe("https://cdn.example.com/updated.jpg");
      expect(body.post.tags).toHaveLength(1);
      expect(body.post.tags[0].name).toBe("updated-tag");
    });
  });

  // ===== DELETE /api/admin/posts/:id =====

  describe("DELETE /api/admin/posts/:id", () => {
    it("Soft Delete → 204", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();
      const post = await seedPost(category.id);

      const response = await app.inject({
        method: "DELETE",
        url: `/api/admin/posts/${post.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it("Soft Delete된 글 → Public GET /api/posts/:slug → 404", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // Soft Delete
      await app.inject({
        method: "DELETE",
        url: `/api/admin/posts/${post.id}`,
        headers: { cookie },
      });

      // Public 조회 → 404
      const response = await app.inject({
        method: "GET",
        url: `/api/posts/${post.slug}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ===== GET /api/admin/posts =====

  describe("GET /api/admin/posts", () => {
    it("Admin은 모든 상태 게시글 조회 가능", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });
      await seedPost(category.id, { status: "draft", visibility: "public" });
      await seedPost(category.id, {
        status: "archived",
        visibility: "private",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/posts",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(3);
    });
  });

});
