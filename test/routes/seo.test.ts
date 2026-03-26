import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, cleanup } from "@test/helpers/app";
import { seedCategory, seedPost, truncateAll } from "@test/helpers/seed";

describe("SEO Routes", () => {
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

  // ===== GET /sitemap.xml =====

  describe("GET /sitemap.xml", () => {
    it("200 + Content-Type application/xml", async () => {
      const response = await app.inject({ method: "GET", url: "/sitemap.xml" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toMatch(/application\/xml/);
    });

    it("Cache-Control: public, max-age=3600", async () => {
      const response = await app.inject({ method: "GET", url: "/sitemap.xml" });

      expect(response.headers["cache-control"]).toBe("public, max-age=3600");
    });

    it("published 공개 글 URL이 포함된다", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        slug: "hello-world",
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({ method: "GET", url: "/sitemap.xml" });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`/posts/${post.slug}`);
      expect(response.body).toContain("<lastmod>");
    });

    it("draft 글은 포함되지 않는다", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        slug: "draft-post",
        status: "draft",
        visibility: "public",
      });

      const response = await app.inject({ method: "GET", url: "/sitemap.xml" });

      expect(response.body).not.toContain(`/posts/${post.slug}`);
    });

    it("private 글은 포함되지 않는다", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        slug: "private-post",
        status: "published",
        visibility: "private",
      });

      const response = await app.inject({ method: "GET", url: "/sitemap.xml" });

      expect(response.body).not.toContain(`/posts/${post.slug}`);
    });

    it("유효한 XML 구조를 반환한다", async () => {
      const response = await app.inject({ method: "GET", url: "/sitemap.xml" });

      expect(response.body).toContain('<?xml version="1.0"');
      expect(response.body).toContain(
        'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
      );
      expect(response.body).toContain("<urlset");
      expect(response.body).toContain("</urlset>");
    });
  });

  // ===== GET /rss.xml =====

  describe("GET /rss.xml", () => {
    it("200 + Content-Type application/rss+xml", async () => {
      const response = await app.inject({ method: "GET", url: "/rss.xml" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toMatch(
        /application\/rss\+xml|application\/xml/,
      );
    });

    it("Cache-Control: public, max-age=3600", async () => {
      const response = await app.inject({ method: "GET", url: "/rss.xml" });

      expect(response.headers["cache-control"]).toBe("public, max-age=3600");
    });

    it("published 공개 글이 피드에 포함된다", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        title: "Test RSS Post",
        slug: "test-rss-post",
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({ method: "GET", url: "/rss.xml" });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(post.title);
      expect(response.body).toContain(`/posts/${post.slug}`);
      expect(response.body).toContain("<pubDate>");
    });

    it("draft 글은 피드에 포함되지 않는다", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        title: "Draft RSS Post",
        slug: "draft-rss-post",
        status: "draft",
        visibility: "public",
      });

      const response = await app.inject({ method: "GET", url: "/rss.xml" });

      expect(response.body).not.toContain(`/posts/${post.slug}`);
    });

    it("RSS 2.0 구조를 반환한다", async () => {
      const response = await app.inject({ method: "GET", url: "/rss.xml" });

      expect(response.body).toContain('<?xml version="1.0"');
      expect(response.body).toContain('<rss version="2.0"');
      expect(response.body).toContain("<channel>");
      expect(response.body).toContain("</channel>");
      expect(response.body).toContain("</rss>");
    });

    it("채널에 title, link, description이 포함된다", async () => {
      const response = await app.inject({ method: "GET", url: "/rss.xml" });

      expect(response.body).toContain("<title>");
      expect(response.body).toContain("<link>");
      expect(response.body).toContain("<description>");
    });

    it("최대 20개 글만 포함된다", async () => {
      const category = await seedCategory();
      const promises = Array.from({ length: 25 }, (_, i) =>
        seedPost(category.id, {
          title: `Post ${i}`,
          slug: `post-${i}-${Date.now()}-${i}`,
          status: "published",
          visibility: "public",
        }),
      );
      await Promise.all(promises);

      const response = await app.inject({ method: "GET", url: "/rss.xml" });

      const itemMatches = response.body.match(/<item>/g);
      expect(itemMatches).not.toBeNull();
      expect(itemMatches!.length).toBeLessThanOrEqual(20);
    });
  });
});
