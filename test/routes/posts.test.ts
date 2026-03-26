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

    it("slug가 제목에서 자동 생성된다 → 201", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Hello World Post",
          contentMd: "# Hello",
          categoryId: category.id,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.post.slug).toMatch(/hello-world-post/);
    });

    it("중복 slug는 suffix로 유니크하게 생성된다 → 201", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      const first = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: { title: "Duplicate Title", contentMd: "# A", categoryId: category.id },
      });
      const second = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: { title: "Duplicate Title", contentMd: "# B", categoryId: category.id },
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      const slug1 = first.json().post.slug as string;
      const slug2 = second.json().post.slug as string;
      expect(slug1).not.toBe(slug2);
    });

    it("status=published + publishedAt 없음 → publishedAt 자동 설정 → 201", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Auto Publish",
          contentMd: "# Content",
          categoryId: category.id,
          status: "published",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.post.publishedAt).not.toBeNull();
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

    it("contentMd 수정 시 contentModifiedAt 갱신 → 200", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();
      const post = await seedPost(category.id);

      const response = await app.inject({
        method: "PATCH",
        url: `/api/admin/posts/${post.id}`,
        headers: { cookie },
        payload: { contentMd: "# Updated Content" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.post.contentModifiedAt).not.toBeNull();
    });

    it("tags=[] 전달 시 태그 전체 제거 → 200", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();
      // 태그가 있는 게시글 생성
      const createRes = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Tagged Post",
          contentMd: "# Hello",
          categoryId: category.id,
          tags: ["tag-a", "tag-b"],
        },
      });
      const postId = createRes.json().post.id as number;

      const response = await app.inject({
        method: "PATCH",
        url: `/api/admin/posts/${postId}`,
        headers: { cookie },
        payload: { tags: [] },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().post.tags).toHaveLength(0);
    });

    it("존재하지 않는 ID → 404", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/admin/posts/99999",
        headers: { cookie },
        payload: { title: "Nope" },
      });

      expect(response.statusCode).toBe(404);
    });

    it("비인증 → 403", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/admin/posts/1",
        payload: { title: "Nope" },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ===== GET /api/admin/posts/:id =====

  describe("GET /api/admin/posts/:id", () => {
    it("상세 조회 성공 — contentMd 포함 PostDetail 반환 → 200", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "draft",
        visibility: "private",
      });

      const response = await app.inject({
        method: "GET",
        url: `/api/admin/posts/${post.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.post.id).toBe(post.id);
      expect(body.post.contentMd).toBeDefined();
      expect(body.post.category).toBeDefined();
      expect(body.post.tags).toBeDefined();
    });

    it("category ancestors 반환 — 중첩 카테고리", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const parent = await seedCategory({ name: "Parent", slug: "parent-cat" });
      const child = await seedCategory({ name: "Child", slug: "child-cat", parentId: parent.id });
      const post = await seedPost(child.id);

      const response = await app.inject({
        method: "GET",
        url: `/api/admin/posts/${post.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.post.category.name).toBe("Child");
      expect(body.post.category.ancestors).toHaveLength(1);
      expect(body.post.category.ancestors[0].name).toBe("Parent");
    });

    it("존재하지 않는 ID → 404", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/posts/99999",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it("비인증 → 403", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/posts/1",
      });

      expect(response.statusCode).toBe(403);
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

    it("status 필터 — status=draft → draft만 반환", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await seedPost(category.id, { status: "draft" });
      await seedPost(category.id, { status: "published" });
      await seedPost(category.id, { status: "archived" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/posts?status=draft",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe("draft");
    });

    it("visibility 필터 — visibility=private → private만 반환", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await seedPost(category.id, { visibility: "public" });
      await seedPost(category.id, { visibility: "private" });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/posts?visibility=private",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].visibility).toBe("private");
    });

    it("includeDeleted=true → 삭제된 글 포함", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      const post = await seedPost(category.id);
      // soft delete
      await app.inject({
        method: "DELETE",
        url: `/api/admin/posts/${post.id}`,
        headers: { cookie },
      });

      const withoutDeleted = await app.inject({
        method: "GET",
        url: "/api/admin/posts",
        headers: { cookie },
      });
      const withDeleted = await app.inject({
        method: "GET",
        url: "/api/admin/posts?includeDeleted=true",
        headers: { cookie },
      });

      expect(withoutDeleted.json().data).toHaveLength(0);
      expect(withDeleted.json().data).toHaveLength(1);
    });

    it("페이지네이션 — limit=2, 총 3개 → meta.totalCount=3", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await seedPost(category.id);
      await seedPost(category.id);
      await seedPost(category.id);

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/posts?limit=2&page=1",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.meta.total).toBe(3);
      expect(body.meta.totalPages).toBe(2);
    });

    it("비인증 → 403", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/posts",
      });

      expect(response.statusCode).toBe(403);
    });
  });

  // ===== GET /api/posts/slugs =====

  describe("GET /api/posts/slugs", () => {
    it("발행된 공개 글의 slug + updatedAt 반환", async () => {
      const category = await seedCategory();

      const published = await seedPost(category.id, {
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
        url: "/api/posts/slugs",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.slugs).toHaveLength(1);
      expect(body.slugs[0].slug).toBe(published.slug);
      expect(body.slugs[0].updatedAt).toBeDefined();
    });

    it("발행된 글이 없으면 빈 배열 반환", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/posts/slugs",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.slugs).toHaveLength(0);
    });
  });

  // ===== GET /api/posts - filter param =====

  describe("GET /api/posts - filter 파라미터 (tag/category/comment)", () => {
    it("filter=tag 로 태그 이름 검색", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Post with Drizzle tag",
          contentMd: "# Content",
          categoryId: category.id,
          status: "published",
          visibility: "public",
          tags: ["drizzle-orm"],
        },
      });
      await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "Post with React tag",
          contentMd: "# Content",
          categoryId: category.id,
          status: "published",
          visibility: "public",
          tags: ["react"],
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?q=drizzle&filter=tag",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("Post with Drizzle tag");
    });

    it("filter=tag, 매칭 태그 없음 → 빈 배열", async () => {
      const category = await seedCategory();
      await seedPost(category.id, { status: "published", visibility: "public" });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?q=nonexistenttag&filter=tag",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(0);
    });

    it("filter=category 로 카테고리 이름 검색", async () => {
      const backend = await seedCategory({ name: "Backend Development" });
      const frontend = await seedCategory({ name: "Frontend Development" });

      await seedPost(backend.id, { status: "published", visibility: "public" });
      await seedPost(frontend.id, { status: "published", visibility: "public" });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?q=Backend&filter=category",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].category.id).toBe(backend.id);
    });

    it("filter=category, 매칭 카테고리 없음 → 빈 배열", async () => {
      const category = await seedCategory({ name: "Existing Category" });
      await seedPost(category.id, { status: "published", visibility: "public" });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?q=NonExistentCategory&filter=category",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(0);
    });

    it("filter=comment 로 댓글 본문 검색", async () => {
      const category = await seedCategory();
      const postA = await seedPost(category.id, {
        title: "Post A",
        status: "published",
        visibility: "public",
      });
      const postB = await seedPost(category.id, {
        title: "Post B",
        status: "published",
        visibility: "public",
      });

      // postA에 "unique keyword" 포함 댓글 추가
      await app.inject({
        method: "POST",
        url: `/api/posts/${postA.id}/comments`,
        payload: {
          body: "This is a unique keyword comment",
          guestName: "Tester",
          guestEmail: "t@example.com",
          guestPassword: "pass1234",
        },
      });
      // postB에는 다른 댓글
      await app.inject({
        method: "POST",
        url: `/api/posts/${postB.id}/comments`,
        payload: {
          body: "Different comment here",
          guestName: "Tester",
          guestEmail: "t@example.com",
          guestPassword: "pass1234",
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?q=unique+keyword&filter=comment",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("Post A");
    });

    it("filter=comment, 매칭 댓글 없음 → 빈 배열", async () => {
      const category = await seedCategory();
      await seedPost(category.id, { status: "published", visibility: "public" });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?q=nomatchcomment&filter=comment",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(0);
    });
  });

  describe("GET /api/posts - filter 파라미터", () => {
    it("filter=title 로 제목에서만 검색", async () => {
      const category = await seedCategory();

      await seedPost(category.id, {
        title: "Drizzle ORM Guide",
        contentMd: "# Guide\n\nFastify is great.",
        status: "published",
        visibility: "public",
      });
      await seedPost(category.id, {
        title: "Fastify Tutorial",
        contentMd: "# Tutorial\n\nDrizzle is great.",
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?q=Drizzle&filter=title",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("Drizzle ORM Guide");
    });

    it("filter=content 로 본문에서만 검색", async () => {
      const category = await seedCategory();

      await seedPost(category.id, {
        title: "Post A",
        contentMd: "# A\n\nFastify content here.",
        status: "published",
        visibility: "public",
      });
      await seedPost(category.id, {
        title: "Fastify Post B",
        contentMd: "# B\n\nDrizzle content here.",
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts?q=Fastify&filter=content",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].title).toBe("Post A");
    });
  });

  // ===== PostDetail schema - category.ancestors =====

  describe("GET /api/posts/:slug - category ancestors", () => {
    it("중첩 카테고리의 ancestors 반환", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);

      const parent = await seedCategory({ name: "Programming" });
      const child = await seedCategory({ name: "TypeScript", parentId: parent.id });

      const createRes = await app.inject({
        method: "POST",
        url: "/api/admin/posts",
        headers: { cookie },
        payload: {
          title: "TypeScript Tips",
          contentMd: "# Tips",
          categoryId: child.id,
          status: "published",
          visibility: "public",
        },
      });

      const { post } = createRes.json();

      const response = await app.inject({
        method: "GET",
        url: `/api/posts/${post.slug}`,
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.post.category.id).toBe(child.id);
      expect(body.post.category.ancestors).toHaveLength(1);
      expect(body.post.category.ancestors[0].name).toBe("Programming");
    });
  });

  // ===== PostListItem schema - totalPageviews and commentCount =====

  describe("GET /api/posts - totalPageviews and commentCount in response", () => {
    it("목록 응답에 totalPageviews와 commentCount 포함", async () => {
      const category = await seedCategory();

      await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/posts",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].totalPageviews).toBeDefined();
      expect(body.data[0].commentCount).toBeDefined();
      expect(typeof body.data[0].totalPageviews).toBe("number");
      expect(typeof body.data[0].commentCount).toBe("number");
    });
  });

});
