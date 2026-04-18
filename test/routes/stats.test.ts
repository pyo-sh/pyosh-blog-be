import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, cleanup, injectAuth } from "@test/helpers/app";
import { seedAdmin, seedCategory, seedPost, truncateAll } from "@test/helpers/seed";
import { db } from "@src/db/client";
import { statsDailyTable } from "@src/db/schema/stats";
import { sql } from "drizzle-orm";

describe("Stats Routes", () => {
  let app: FastifyInstance;

  async function getCsrfHeaders(cookie?: string): Promise<Record<string, string>> {
    const response = await app.inject({
      method: "GET",
      url: "/auth/csrf-token",
      headers: cookie ? { cookie } : undefined,
    });
    const setCookie = response.headers["set-cookie"];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const headers: Record<string, string> = {
      "x-csrf-token": response.json().token,
    };

    if (raw || cookie) {
      headers.cookie = (raw ?? cookie)!.split(";")[0];
    }

    return headers;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanup(app);
  });

  beforeEach(async () => {
    await truncateAll();
  });

  // ===== POST /stats/view =====

  describe("POST /stats/view", () => {
    it("postId 없이 사이트 전체 조회수 기록 → 200", async () => {
      const csrfHeaders = await getCsrfHeaders();
      const response = await app.inject({
        method: "POST",
        url: "/stats/view",
        headers: csrfHeaders,
        remoteAddress: "10.0.0.1",
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, deduplicated: false });
    });

    it("존재하는 공개 게시글 postId → 200", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });
      const csrfHeaders = await getCsrfHeaders();

      const response = await app.inject({
        method: "POST",
        url: "/stats/view",
        headers: csrfHeaders,
        remoteAddress: "10.0.0.2",
        payload: { postId: post.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, deduplicated: false });
    });

    it("존재하지 않는 postId → 404", async () => {
      const csrfHeaders = await getCsrfHeaders();
      const response = await app.inject({
        method: "POST",
        url: "/stats/view",
        headers: csrfHeaders,
        remoteAddress: "10.0.0.3",
        payload: { postId: 99999 },
      });

      expect(response.statusCode).toBe(404);
    });

    it("비공개 게시글 postId → 404", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "private",
      });
      const csrfHeaders = await getCsrfHeaders();

      const response = await app.inject({
        method: "POST",
        url: "/stats/view",
        headers: csrfHeaders,
        remoteAddress: "10.0.0.4",
        payload: { postId: post.id },
      });

      expect(response.statusCode).toBe(404);
    });

    it("같은 IP 5분 내 동일 대상 재요청 → deduplicated: true", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });
      const csrfHeaders = await getCsrfHeaders();

      await app.inject({
        method: "POST",
        url: "/stats/view",
        headers: csrfHeaders,
        remoteAddress: "1.2.3.4",
        payload: { postId: post.id },
      });

      const response = await app.inject({
        method: "POST",
        url: "/stats/view",
        headers: csrfHeaders,
        remoteAddress: "1.2.3.4",
        payload: { postId: post.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, deduplicated: true });
    });

    it("같은 IP, 다른 대상(글 vs 사이트) → 중복 아님", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });
      const csrfHeaders = await getCsrfHeaders();

      const postRes = await app.inject({
        method: "POST",
        url: "/stats/view",
        headers: csrfHeaders,
        remoteAddress: "10.0.0.6",
        payload: { postId: post.id },
      });

      const siteRes = await app.inject({
        method: "POST",
        url: "/stats/view",
        headers: csrfHeaders,
        remoteAddress: "10.0.0.6",
        payload: {},
      });

      expect(postRes.json().deduplicated).toBe(false);
      expect(siteRes.json().deduplicated).toBe(false);
    });
  });

  // ===== GET /stats/popular =====

  describe("GET /stats/popular", () => {
    it("데이터 없으면 빈 배열", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/stats/popular",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: [] });
    });

    it("인기 게시글 목록 반환 (pageviews 내림차순)", async () => {
      const category = await seedCategory();
      const post1 = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });
      const post2 = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const today = new Date();
      await db.insert(statsDailyTable).values([
        { postId: post1.id, date: today, pageviews: 10, uniques: 8 },
        { postId: post2.id, date: today, pageviews: 5, uniques: 4 },
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/stats/popular?limit=10&days=7",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].postId).toBe(post1.id);
      expect(body.data[0].pageviews).toBe(10);
      expect(body.data[0].uniques).toBe(8);
    });

    it("비공개/삭제 게시글 제외", async () => {
      const category = await seedCategory();
      const privatePost = await seedPost(category.id, {
        status: "published",
        visibility: "private",
      });

      const today = new Date();
      await db.insert(statsDailyTable).values([
        { postId: privatePost.id, date: today, pageviews: 100, uniques: 50 },
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/stats/popular",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(0);
    });

    it("limit 파라미터 동작", async () => {
      const category = await seedCategory();
      const today = new Date();

      for (let i = 0; i < 5; i++) {
        const post = await seedPost(category.id, {
          status: "published",
          visibility: "public",
        });
        await db.insert(statsDailyTable).values([
          { postId: post.id, date: today, pageviews: i + 1, uniques: 1 },
        ]);
      }

      const response = await app.inject({
        method: "GET",
        url: "/stats/popular?limit=3",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(3);
    });
  });

  // ===== GET /stats/total-views =====

  describe("GET /stats/total-views", () => {
    it("데이터 없으면 0 반환", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/stats/total-views",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ totalPageviews: 0 });
    });

    it("postId=0 센티넬 행의 pageviews 합산 반환", async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      await db.insert(statsDailyTable).values([
        { postId: 0, date: today, pageviews: 50, uniques: 30 },
        { postId: 0, date: yesterday, pageviews: 70, uniques: 40 },
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/stats/total-views",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ totalPageviews: 120 });
    });

    it("postId 있는 행은 집계에서 제외", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id);
      const today = new Date();

      await db.insert(statsDailyTable).values([
        { postId: 0, date: today, pageviews: 20, uniques: 10 },
        { postId: post.id, date: today, pageviews: 100, uniques: 50 },
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/stats/total-views",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ totalPageviews: 20 });
    });
  });

  // ===== GET /admin/stats/dashboard =====

  describe("GET /admin/stats/dashboard", () => {
    it("관리자 인증 없으면 403", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/stats/dashboard",
      });

      expect(response.statusCode).toBe(403);
    });

    it("대시보드 통계 반환 (postsByStatus 포함)", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);
      const category = await seedCategory();

      await seedPost(category.id, { status: "published", visibility: "public" });
      await seedPost(category.id, { status: "draft", visibility: "public" });
      await seedPost(category.id, { status: "archived", visibility: "public" });

      const response = await app.inject({
        method: "GET",
        url: "/admin/stats/dashboard",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(typeof body.todayPageviews).toBe("number");
      expect(typeof body.weekPageviews).toBe("number");
      expect(typeof body.monthPageviews).toBe("number");
      expect(body.totalPosts).toBe(3);
      expect(typeof body.totalComments).toBe("number");
      expect(body.postsByStatus).toMatchObject({
        draft: 1,
        published: 1,
        archived: 1,
      });
    });

    it("통계가 없으면 pageviews는 0", async () => {
      await seedAdmin();
      const cookie = await injectAuth(app);

      const response = await app.inject({
        method: "GET",
        url: "/admin/stats/dashboard",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.todayPageviews).toBe(0);
      expect(body.weekPageviews).toBe(0);
      expect(body.monthPageviews).toBe(0);
      expect(body.postsByStatus).toEqual({ draft: 0, published: 0, archived: 0 });
    });
  });
});
