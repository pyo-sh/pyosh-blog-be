import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestApp,
  cleanup,
  injectAuth,
  injectOAuthUser,
} from "@test/helpers/app";
import {
  seedAdmin,
  seedCategory,
  seedPost,
  seedUser,
  truncateAll,
} from "@test/helpers/seed";

describe("Comment Routes", () => {
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

  // ===== POST /api/posts/:postId/comments =====

  describe("POST /api/posts/:postId/comments", () => {
    it("게스트 댓글 작성 → 201", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        payload: {
          body: "게스트 댓글입니다.",
          guestName: "홍길동",
          guestEmail: "guest@example.com",
          guestPassword: "pass1234",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.data.body).toBe("게스트 댓글입니다.");
      expect(body.data.author.type).toBe("guest");
      expect(body.data.author.name).toBe("홍길동");
      expect(body.data.depth).toBe(0);
    });

    it("OAuth 사용자 댓글 작성 → 201", async () => {
      const user = await seedUser({ name: "OAuth User" });
      const cookie = await injectOAuthUser(user.id);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        headers: { cookie },
        payload: {
          body: "OAuth 댓글입니다.",
          isSecret: false,
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.data.body).toBe("OAuth 댓글입니다.");
      expect(body.data.author.type).toBe("oauth");
      expect(body.data.author.name).toBe("OAuth User");
      expect(body.data.depth).toBe(0);
    });

    it("대댓글 (depth=1) 작성 → 201", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 루트 댓글 작성
      const rootResponse = await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        payload: {
          body: "루트 댓글입니다.",
          guestName: "부모",
          guestEmail: "parent@example.com",
          guestPassword: "pass1234",
        },
      });
      expect(rootResponse.statusCode).toBe(201);
      const rootComment = rootResponse.json().data;

      // 대댓글 작성
      const replyResponse = await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        payload: {
          body: "대댓글입니다.",
          parentId: rootComment.id,
          guestName: "자식",
          guestEmail: "child@example.com",
          guestPassword: "pass5678",
        },
      });

      expect(replyResponse.statusCode).toBe(201);

      const replyBody = replyResponse.json();
      expect(replyBody.data.depth).toBe(1);
      expect(replyBody.data.parentId).toBe(rootComment.id);
    });

    it("depth=2 시도 → 400", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 루트 댓글 (depth=0)
      const rootResponse = await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        payload: {
          body: "루트 댓글",
          guestName: "A",
          guestEmail: "a@example.com",
          guestPassword: "pass1234",
        },
      });
      const rootComment = rootResponse.json().data;

      // 대댓글 (depth=1)
      const childResponse = await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        payload: {
          body: "대댓글",
          parentId: rootComment.id,
          guestName: "B",
          guestEmail: "b@example.com",
          guestPassword: "pass1234",
        },
      });
      const childComment = childResponse.json().data;

      // depth=2 시도 → 400
      const grandChildResponse = await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        payload: {
          body: "대대댓글 시도",
          parentId: childComment.id,
          guestName: "C",
          guestEmail: "c@example.com",
          guestPassword: "pass1234",
        },
      });

      expect(grandChildResponse.statusCode).toBe(400);
    });
  });

  // ===== GET /api/posts/:postId/comments =====

  describe("GET /api/posts/:postId/comments", () => {
    it("댓글 목록 조회 → 계층 구조 확인", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 루트 댓글
      const rootResponse = await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        payload: {
          body: "루트 댓글",
          guestName: "루트 작성자",
          guestEmail: "root@example.com",
          guestPassword: "pass1234",
        },
      });
      const rootComment = rootResponse.json().data;

      // 대댓글
      await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        payload: {
          body: "대댓글",
          parentId: rootComment.id,
          guestName: "대댓글 작성자",
          guestEmail: "reply@example.com",
          guestPassword: "pass5678",
        },
      });

      // 목록 조회
      const listResponse = await app.inject({
        method: "GET",
        url: `/api/posts/${post.id}/comments`,
      });

      expect(listResponse.statusCode).toBe(200);

      const body = listResponse.json();
      expect(body.data).toHaveLength(1); // 루트만
      expect(body.data[0].depth).toBe(0);
      expect(body.data[0].replies).toHaveLength(1); // 대댓글 포함
      expect(body.data[0].replies[0].depth).toBe(1);
      expect(body.data[0].replies[0].body).toBe("대댓글");
    });

    it("비밀 댓글 마스킹 확인", async () => {
      const user = await seedUser({ name: "Secret Author" });
      const cookie = await injectOAuthUser(user.id);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 비밀 댓글 작성 (OAuth 사용자)
      await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        headers: { cookie },
        payload: {
          body: "비밀 내용입니다.",
          isSecret: true,
        },
      });

      // 비인증 조회 → 마스킹
      const publicResponse = await app.inject({
        method: "GET",
        url: `/api/posts/${post.id}/comments`,
      });

      expect(publicResponse.statusCode).toBe(200);
      const publicBody = publicResponse.json();
      expect(publicBody.data[0].body).toBe("비밀 댓글입니다");

      // 작성자 조회 → 원본
      const authorResponse = await app.inject({
        method: "GET",
        url: `/api/posts/${post.id}/comments`,
        headers: { cookie },
      });

      expect(authorResponse.statusCode).toBe(200);
      const authorBody = authorResponse.json();
      expect(authorBody.data[0].body).toBe("비밀 내용입니다.");
    });
  });

  // ===== DELETE /api/comments/:id =====

  describe("DELETE /api/comments/:id", () => {
    it("게스트 댓글 삭제 (비밀번호) → 204", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 게스트 댓글 작성
      const createResponse = await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        payload: {
          body: "삭제될 댓글",
          guestName: "삭제자",
          guestEmail: "delete@example.com",
          guestPassword: "mypassword123",
        },
      });
      const comment = createResponse.json().data;

      // 비밀번호로 삭제
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/comments/${comment.id}`,
        payload: { guestPassword: "mypassword123" },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // 삭제 후 목록에서 사라짐 확인
      const listResponse = await app.inject({
        method: "GET",
        url: `/api/posts/${post.id}/comments`,
      });
      expect(listResponse.json().data).toHaveLength(0);
    });

    it("다른 사용자의 댓글 삭제 시도 → 403", async () => {
      const userA = await seedUser({ name: "User A" });
      const cookieA = await injectOAuthUser(userA.id);

      const userB = await seedUser({ name: "User B" });
      const cookieB = await injectOAuthUser(userB.id);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // User A가 댓글 작성
      const createResponse = await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        headers: { cookie: cookieA },
        payload: { body: "User A의 댓글" },
      });
      const comment = createResponse.json().data;

      // User B가 삭제 시도 → 403
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/comments/${comment.id}`,
        headers: { cookie: cookieB },
      });

      expect(deleteResponse.statusCode).toBe(403);
    });
  });

  // ===== DELETE /api/admin/comments/:id =====

  describe("DELETE /api/admin/comments/:id", () => {
    it("관리자 강제 삭제 → 204", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const createResponse = await app.inject({
        method: "POST",
        url: `/api/posts/${post.id}/comments`,
        payload: {
          body: "관리자가 삭제할 댓글",
          guestName: "작성자",
          guestEmail: "writer@example.com",
          guestPassword: "pass1234",
        },
      });
      const comment = createResponse.json().data;

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/admin/comments/${comment.id}`,
        headers: { cookie: adminCookie },
      });

      expect(deleteResponse.statusCode).toBe(204);
    });
  });
});
