import { eq, inArray } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "@src/db/client";
import { commentTable } from "@src/db/schema";
import {
  createTestApp,
  cleanup,
  injectAuth,
  injectOAuthUser,
} from "@test/helpers/app";
import {
  seedAdmin,
  seedCategory,
  seedComment,
  seedOAuthUser,
  seedPost,
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

  // ===== POST /posts/:postId/comments =====

  describe("POST /posts/:postId/comments", () => {
    it("게스트 댓글 작성 → 201", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
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
      expect(body.revealToken).toBeNull();
    });

    it("게스트 비밀 댓글 작성 시 revealToken 발급 → 201", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "게스트 비밀 댓글입니다.",
          guestName: "홍길동",
          guestPassword: "pass1234",
          isSecret: true,
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.data.body).toBe("게스트 비밀 댓글입니다.");
      expect(body.data.isSecret).toBe(true);
      expect(typeof body.revealToken).toBe("string");
      expect(body.revealToken.length).toBeGreaterThan(20);
    });

    it("OAuth 사용자 댓글 작성 → 201", async () => {
      const user = await seedOAuthUser({ displayName: "OAuth User" });
      const cookie = await injectOAuthUser(user.id);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const response = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
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

    it("private 게시글에는 댓글을 작성할 수 없다 → 404", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "private",
      });

      const response = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "비공개 글 댓글",
          guestName: "홍길동",
          guestPassword: "pass1234",
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("draft 게시글에는 댓글을 작성할 수 없다 → 404", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "draft",
        visibility: "public",
      });

      const response = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "초안 글 댓글",
          guestName: "홍길동",
          guestPassword: "pass1234",
        },
      });

      expect(response.statusCode).toBe(404);
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
        url: `/posts/${post.id}/comments`,
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
        url: `/posts/${post.id}/comments`,
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
        url: `/posts/${post.id}/comments`,
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
        url: `/posts/${post.id}/comments`,
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
        url: `/posts/${post.id}/comments`,
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

  // ===== GET /posts/:postId/comments =====

  describe("GET /posts/:postId/comments", () => {
    it("댓글 목록 조회 → 계층 구조 + 페이지네이션 메타 확인", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 루트 댓글
      const rootResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
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
        url: `/posts/${post.id}/comments`,
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
        url: `/posts/${post.id}/comments`,
      });

      expect(listResponse.statusCode).toBe(200);

      const body = listResponse.json();
      expect(body.data).toHaveLength(1); // 루트만
      expect(body.data[0].depth).toBe(0);
      expect(body.data[0].replies).toHaveLength(1); // 대댓글 포함
      expect(body.data[0].replies[0].depth).toBe(1);
      expect(body.data[0].replies[0].body).toBe("대댓글");

      // 페이지네이션 메타 확인
      expect(body.meta).toBeDefined();
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.totalCount).toBe(2); // 루트 + 대댓글
      expect(body.meta.totalRootComments).toBe(1);
      expect(body.meta.totalPages).toBe(1);
    });

    it("페이지네이션 동작 확인 (page, limit)", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 루트 댓글 3개 작성
      for (let i = 1; i <= 3; i++) {
        await app.inject({
          method: "POST",
          url: `/posts/${post.id}/comments`,
          payload: {
            body: `댓글 ${i}`,
            guestName: `작성자${i}`,
            guestEmail: `user${i}@example.com`,
            guestPassword: "pass1234",
          },
        });
      }

      // page=1, limit=2
      const page1 = await app.inject({
        method: "GET",
        url: `/posts/${post.id}/comments?page=1&limit=2`,
      });

      expect(page1.statusCode).toBe(200);
      const page1Body = page1.json();
      expect(page1Body.data).toHaveLength(2);
      expect(page1Body.meta.totalRootComments).toBe(3);
      expect(page1Body.meta.totalPages).toBe(2);

      // page=2, limit=2
      const page2 = await app.inject({
        method: "GET",
        url: `/posts/${post.id}/comments?page=2&limit=2`,
      });

      expect(page2.statusCode).toBe(200);
      const page2Body = page2.json();
      expect(page2Body.data).toHaveLength(1);
    });

    it("private 게시글 댓글 목록은 조회할 수 없다 → 404", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "private",
      });
      await seedComment(post.id, { body: "숨겨진 댓글" });

      const response = await app.inject({
        method: "GET",
        url: `/posts/${post.id}/comments`,
      });

      expect(response.statusCode).toBe(404);
    });

    it("archived 게시글 댓글 목록은 조회할 수 없다 → 404", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "archived",
        visibility: "public",
      });
      await seedComment(post.id, { body: "보관 글 댓글" });

      const response = await app.inject({
        method: "GET",
        url: `/posts/${post.id}/comments`,
      });

      expect(response.statusCode).toBe(404);
    });

    it("비밀 댓글 마스킹 확인", async () => {
      const user = await seedOAuthUser({ displayName: "Secret Author" });
      const cookie = await injectOAuthUser(user.id);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 비밀 댓글 작성 (OAuth 사용자)
      await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        headers: { cookie },
        payload: {
          body: "비밀 내용입니다.",
          isSecret: true,
        },
      });

      // 비인증 조회 → 마스킹
      const publicResponse = await app.inject({
        method: "GET",
        url: `/posts/${post.id}/comments`,
      });

      expect(publicResponse.statusCode).toBe(200);
      const publicBody = publicResponse.json();
      expect(publicBody.data[0].body).toBe("This comment is secret.");

      // 작성자 조회 → 원본
      const authorResponse = await app.inject({
        method: "GET",
        url: `/posts/${post.id}/comments`,
        headers: { cookie },
      });

      expect(authorResponse.statusCode).toBe(200);
      const authorBody = authorResponse.json();
      expect(authorBody.data[0].body).toBe("비밀 내용입니다.");
    });

    it("게스트 비밀 댓글은 revealToken으로 원문 복원 가능", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const createResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "게스트 비밀 원문",
          guestName: "비밀 작성자",
          guestPassword: "pass1234",
          isSecret: true,
        },
      });

      expect(createResponse.statusCode).toBe(201);
      const { data: comment, revealToken } = createResponse.json();

      const publicResponse = await app.inject({
        method: "GET",
        url: `/posts/${post.id}/comments`,
      });
      expect(publicResponse.statusCode).toBe(200);
      expect(publicResponse.json().data[0].body).toBe(
        "This comment is secret.",
      );

      const revealResponse = await app.inject({
        method: "POST",
        url: `/comments/${comment.id}/reveal`,
        payload: { revealToken },
      });

      expect(revealResponse.statusCode).toBe(200);
      expect(revealResponse.json().data.body).toBe("게스트 비밀 원문");
    });

    it("다른 댓글의 revealToken으로는 원문 복원 불가", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const firstCreate = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "첫 번째 비밀 댓글",
          guestName: "작성자1",
          guestPassword: "pass1234",
          isSecret: true,
        },
      });
      const secondCreate = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "두 번째 비밀 댓글",
          guestName: "작성자2",
          guestPassword: "pass5678",
          isSecret: true,
        },
      });

      const first = firstCreate.json();
      const second = secondCreate.json();

      const revealResponse = await app.inject({
        method: "POST",
        url: `/comments/${second.data.id}/reveal`,
        payload: { revealToken: first.revealToken },
      });

      expect(revealResponse.statusCode).toBe(403);
    });

    it("삭제된 비밀 댓글은 revealToken으로도 복원 불가", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const createResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "삭제될 비밀 댓글",
          guestName: "삭제자",
          guestPassword: "pass1234",
          isSecret: true,
        },
      });

      const { data: comment, revealToken } = createResponse.json();

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/comments/${comment.id}`,
        payload: { guestPassword: "pass1234" },
      });
      expect(deleteResponse.statusCode).toBe(204);

      const revealResponse = await app.inject({
        method: "POST",
        url: `/comments/${comment.id}/reveal`,
        payload: { revealToken },
      });

      expect(revealResponse.statusCode).toBe(404);
    });
  });

  // ===== DELETE /comments/:id =====

  describe("DELETE /comments/:id", () => {
    it("게스트 댓글 삭제 (비밀번호) → 204", async () => {
      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 게스트 댓글 작성
      const createResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
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
        url: `/comments/${comment.id}`,
        payload: { guestPassword: "mypassword123" },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // 삭제 후 목록에서 사라짐 확인
      const listResponse = await app.inject({
        method: "GET",
        url: `/posts/${post.id}/comments`,
      });
      expect(listResponse.json().data).toHaveLength(0);
    });

    it("다른 사용자의 댓글 삭제 시도 → 403", async () => {
      const userA = await seedOAuthUser({ displayName: "User A" });
      const cookieA = await injectOAuthUser(userA.id);

      const userB = await seedOAuthUser({ displayName: "User B" });
      const cookieB = await injectOAuthUser(userB.id);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // User A가 댓글 작성
      const createResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        headers: { cookie: cookieA },
        payload: { body: "User A의 댓글" },
      });
      const comment = createResponse.json().data;

      // User B가 삭제 시도 → 403
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/comments/${comment.id}`,
        headers: { cookie: cookieB },
      });

      expect(deleteResponse.statusCode).toBe(403);
    });
  });

  // ===== GET /admin/comments =====

  describe("GET /admin/comments", () => {
    it("관리자 인증 없이 접근 → 403", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/comments",
      });

      expect(response.statusCode).toBe(403);
    });

    it("전체 댓글 목록 조회 → 페이지네이션 구조 + post.title 확인", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
        title: "테스트 게시글",
      });

      // 댓글 2개 작성
      await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "첫 번째 댓글",
          guestName: "작성자1",
          guestEmail: "a@example.com",
          guestPassword: "pass1234",
        },
      });
      await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "두 번째 댓글",
          guestName: "작성자2",
          guestEmail: "b@example.com",
          guestPassword: "pass1234",
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/admin/comments",
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.meta.total).toBe(2);
      expect(body.meta.page).toBe(1);
      // post.title 포함 확인
      expect(body.data[0].post).toBeDefined();
      expect(body.data[0].post.title).toBe("테스트 게시글");
    });

    it("status 필터 적용 → deleted 댓글만 반환", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const createResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "삭제될 댓글",
          guestName: "작성자",
          guestEmail: "a@example.com",
          guestPassword: "pass1234",
        },
      });
      const comment = createResponse.json().data;

      // 댓글 soft delete
      await app.inject({
        method: "DELETE",
        url: `/admin/comments/${comment.id}?action=soft_delete`,
        headers: { cookie: adminCookie },
      });

      // status=active 필터 → 0개
      const activeResponse = await app.inject({
        method: "GET",
        url: "/admin/comments?status=active",
        headers: { cookie: adminCookie },
      });
      expect(activeResponse.json().data).toHaveLength(0);

      // status=deleted 필터 → 1개
      const deletedResponse = await app.inject({
        method: "GET",
        url: "/admin/comments?status=deleted",
        headers: { cookie: adminCookie },
      });
      expect(deletedResponse.json().data).toHaveLength(1);
    });

    it("postId 필터 적용 → 해당 게시글 댓글만 반환", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post1 = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });
      const post2 = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      await app.inject({
        method: "POST",
        url: `/posts/${post1.id}/comments`,
        payload: {
          body: "post1 댓글",
          guestName: "작성자",
          guestEmail: "a@example.com",
          guestPassword: "pass1234",
        },
      });
      await app.inject({
        method: "POST",
        url: `/posts/${post2.id}/comments`,
        payload: {
          body: "post2 댓글",
          guestName: "작성자",
          guestEmail: "b@example.com",
          guestPassword: "pass1234",
        },
      });

      const response = await app.inject({
        method: "GET",
        url: `/admin/comments?postId=${post1.id}`,
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].body).toBe("post1 댓글");
    });

    it("비밀 댓글도 원문 반환 (마스킹 없음)", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const user = await seedOAuthUser({ displayName: "Secret Writer" });
      const userCookie = await injectOAuthUser(user.id);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        headers: { cookie: userCookie },
        payload: {
          body: "비밀 내용 원문",
          isSecret: true,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/admin/comments",
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data[0].body).toBe("비밀 내용 원문");
    });

    it("authorType 필터 적용 → guest/oauth 댓글 구분 반환", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const user = await seedOAuthUser({ displayName: "OAuth Writer" });
      const userCookie = await injectOAuthUser(user.id);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // OAuth 댓글
      await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        headers: { cookie: userCookie },
        payload: { body: "OAuth 댓글" },
      });

      // 게스트 댓글
      await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "게스트 댓글",
          guestName: "게스트",
          guestEmail: "g@example.com",
          guestPassword: "pass1234",
        },
      });

      // authorType=guest 필터 → 1개 (게스트만)
      const guestResponse = await app.inject({
        method: "GET",
        url: "/admin/comments?authorType=guest",
        headers: { cookie: adminCookie },
      });
      expect(guestResponse.statusCode).toBe(200);
      const guestBody = guestResponse.json();
      expect(guestBody.data).toHaveLength(1);
      expect(guestBody.data[0].author.type).toBe("guest");

      // authorType=oauth 필터 → 1개 (OAuth만)
      const oauthResponse = await app.inject({
        method: "GET",
        url: "/admin/comments?authorType=oauth",
        headers: { cookie: adminCookie },
      });
      expect(oauthResponse.statusCode).toBe(200);
      const oauthBody = oauthResponse.json();
      expect(oauthBody.data).toHaveLength(1);
      expect(oauthBody.data[0].author.type).toBe("oauth");
    });

    it("order 파라미터 → asc/desc 정렬 순서 확인", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // DB 직접 삽입으로 distinct created_at 보장 (TIMESTAMP precision = 1s)
      const now = Date.now();
      await seedComment(post.id, {
        body: "댓글 1",
        createdAt: new Date(now - 2000),
      });
      await seedComment(post.id, {
        body: "댓글 2",
        createdAt: new Date(now - 1000),
      });
      await seedComment(post.id, {
        body: "댓글 3",
        createdAt: new Date(now),
      });

      const descResponse = await app.inject({
        method: "GET",
        url: "/admin/comments?order=desc",
        headers: { cookie: adminCookie },
      });
      const ascResponse = await app.inject({
        method: "GET",
        url: "/admin/comments?order=asc",
        headers: { cookie: adminCookie },
      });

      expect(descResponse.statusCode).toBe(200);
      expect(ascResponse.statusCode).toBe(200);

      const descData = descResponse.json().data;
      const ascData = ascResponse.json().data;

      expect(descData).toHaveLength(3);
      expect(ascData).toHaveLength(3);

      // desc의 첫 번째 = asc의 마지막, asc의 첫 번째 = desc의 마지막
      expect(descData[0].id).toBe(ascData[ascData.length - 1].id);
      expect(ascData[0].id).toBe(descData[descData.length - 1].id);
    });
  });

  // ===== GET /admin/comments/:id/thread =====

  describe("GET /admin/comments/:id/thread", () => {
    it("루트 댓글 ID로 스레드 조회 → 부모 + 답글 반환", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 루트 댓글
      const rootResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "루트 댓글",
          guestName: "부모",
          guestEmail: "parent@example.com",
          guestPassword: "pass1234",
        },
      });
      const rootComment = rootResponse.json().data;

      // 답글 2개
      await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "답글 1",
          parentId: rootComment.id,
          guestName: "자식1",
          guestEmail: "child1@example.com",
          guestPassword: "pass1234",
        },
      });
      await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "답글 2",
          parentId: rootComment.id,
          guestName: "자식2",
          guestEmail: "child2@example.com",
          guestPassword: "pass1234",
        },
      });

      const response = await app.inject({
        method: "GET",
        url: `/admin/comments/${rootComment.id}/thread`,
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.parent).toBeDefined();
      expect(body.parent.id).toBe(rootComment.id);
      expect(body.replies).toHaveLength(2);
    });

    it("답글 ID로 스레드 조회 → 루트 부모로 정규화", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 루트 댓글
      const rootResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "루트 댓글",
          guestName: "부모",
          guestEmail: "parent@example.com",
          guestPassword: "pass1234",
        },
      });
      const rootComment = rootResponse.json().data;

      // 답글
      const replyResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "답글",
          parentId: rootComment.id,
          guestName: "자식",
          guestEmail: "child@example.com",
          guestPassword: "pass1234",
        },
      });
      const replyComment = replyResponse.json().data;

      // 답글 ID로 스레드 조회 → parent.id는 루트 ID
      const response = await app.inject({
        method: "GET",
        url: `/admin/comments/${replyComment.id}/thread`,
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.parent.id).toBe(rootComment.id);
      expect(body.replies).toHaveLength(1);
    });

    it("존재하지 않는 댓글 ID → 404", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const response = await app.inject({
        method: "GET",
        url: "/admin/comments/99999/thread",
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ===== PUT /admin/comments/:id/hide =====

  describe("PUT /admin/comments/:id/hide", () => {
    it("active 댓글 숨김 → 200 + hidden 전환", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const csrfToken = (
        await app.inject({
          method: "GET",
          url: "/auth/csrf-token",
          headers: { cookie: adminCookie },
        })
      ).json().token;

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const comment = await seedComment(post.id, {
        body: "숨길 댓글",
        status: "active",
      });

      const hideResponse = await app.inject({
        method: "PUT",
        url: `/admin/comments/${comment.id}/hide`,
        headers: {
          cookie: adminCookie,
          "x-csrf-token": csrfToken,
        },
      });

      expect(hideResponse.statusCode).toBe(200);
      expect(hideResponse.json().success).toBe(true);

      const [hiddenComment] = await db
        .select()
        .from(commentTable)
        .where(eq(commentTable.id, comment.id));

      expect(hiddenComment?.status).toBe("hidden");
      expect(hiddenComment?.deletedAt).toBeNull();
    });

    it("deleted 댓글 숨김 시도 → 400", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const csrfToken = (
        await app.inject({
          method: "GET",
          url: "/auth/csrf-token",
          headers: { cookie: adminCookie },
        })
      ).json().token;

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const comment = await seedComment(post.id, {
        body: "이미 삭제된 댓글",
        status: "deleted",
        deletedAt: new Date(),
      });

      const hideResponse = await app.inject({
        method: "PUT",
        url: `/admin/comments/${comment.id}/hide`,
        headers: {
          cookie: adminCookie,
          "x-csrf-token": csrfToken,
        },
      });

      expect(hideResponse.statusCode).toBe(400);
    });

    it("루트 댓글 숨김 시 public meta/목록에서 답글도 함께 제외", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const csrfToken = (
        await app.inject({
          method: "GET",
          url: "/auth/csrf-token",
          headers: { cookie: adminCookie },
        })
      ).json().token;

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const rootComment = await seedComment(post.id, {
        body: "숨길 루트 댓글",
        status: "active",
      });
      await seedComment(post.id, {
        body: "활성 답글",
        parentId: rootComment.id,
        depth: 1,
        status: "active",
      });

      const hideResponse = await app.inject({
        method: "PUT",
        url: `/admin/comments/${rootComment.id}/hide`,
        headers: {
          cookie: adminCookie,
          "x-csrf-token": csrfToken,
        },
      });

      expect(hideResponse.statusCode).toBe(200);

      const publicResponse = await app.inject({
        method: "GET",
        url: `/posts/${post.id}/comments`,
      });

      expect(publicResponse.statusCode).toBe(200);
      expect(publicResponse.json().data).toHaveLength(0);
      expect(publicResponse.json().meta.totalCount).toBe(0);
      expect(publicResponse.json().meta.totalRootComments).toBe(0);
    });
  });

  // ===== PUT /admin/comments/:id/restore =====

  describe("PUT /admin/comments/:id/restore", () => {
    it("삭제된 댓글 복원 → 200 + success:true", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      // 댓글 작성 후 삭제
      const createResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "복원될 댓글",
          guestName: "작성자",
          guestEmail: "a@example.com",
          guestPassword: "pass1234",
        },
      });
      const comment = createResponse.json().data;

      await app.inject({
        method: "DELETE",
        url: `/admin/comments/${comment.id}?action=soft_delete`,
        headers: { cookie: adminCookie },
      });

      // 복원
      const restoreResponse = await app.inject({
        method: "PUT",
        url: `/admin/comments/${comment.id}/restore`,
        headers: { cookie: adminCookie },
      });

      expect(restoreResponse.statusCode).toBe(200);
      expect(restoreResponse.json().success).toBe(true);

      // active 상태로 복원됐는지 확인
      const listResponse = await app.inject({
        method: "GET",
        url: "/admin/comments?status=active",
        headers: { cookie: adminCookie },
      });
      expect(listResponse.json().data).toHaveLength(1);
    });

    it("hidden 댓글 복원 → 200 + active 전환", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const comment = await seedComment(post.id, {
        body: "숨김 댓글",
        status: "hidden",
      });

      const restoreResponse = await app.inject({
        method: "PUT",
        url: `/admin/comments/${comment.id}/restore`,
        headers: { cookie: adminCookie },
      });

      expect(restoreResponse.statusCode).toBe(200);
      expect(restoreResponse.json().success).toBe(true);

      const [restored] = await db
        .select()
        .from(commentTable)
        .where(eq(commentTable.id, comment.id));

      expect(restored?.status).toBe("active");
      expect(restored?.deletedAt).toBeNull();
    });

    it("삭제되지 않은 댓글 복원 시도 → 400", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const createResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "활성 댓글",
          guestName: "작성자",
          guestEmail: "a@example.com",
          guestPassword: "pass1234",
        },
      });
      const comment = createResponse.json().data;

      const restoreResponse = await app.inject({
        method: "PUT",
        url: `/admin/comments/${comment.id}/restore`,
        headers: { cookie: adminCookie },
      });

      expect(restoreResponse.statusCode).toBe(400);
    });
  });

  // ===== DELETE /admin/comments/:id =====

  describe("DELETE /admin/comments/:id", () => {
    it("soft_delete → 204, 관리자 목록에서 deleted 상태로 조회 가능", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const createResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "소프트 삭제될 댓글",
          guestName: "작성자",
          guestEmail: "writer@example.com",
          guestPassword: "pass1234",
        },
      });
      const comment = createResponse.json().data;

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/admin/comments/${comment.id}?action=soft_delete`,
        headers: { cookie: adminCookie },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // 관리자 목록에서 deleted로 조회 가능
      const listResponse = await app.inject({
        method: "GET",
        url: "/admin/comments?status=deleted",
        headers: { cookie: adminCookie },
      });
      expect(listResponse.json().data).toHaveLength(1);
    });

    it("hard_delete → 204, 대댓글 포함 완전 삭제", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const rootResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "루트 댓글",
          guestName: "부모",
          guestEmail: "parent@example.com",
          guestPassword: "pass1234",
        },
      });
      const rootComment = rootResponse.json().data;

      // 답글 작성
      await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "답글",
          parentId: rootComment.id,
          guestName: "자식",
          guestEmail: "child@example.com",
          guestPassword: "pass1234",
        },
      });

      // hard_delete
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/admin/comments/${rootComment.id}?action=hard_delete`,
        headers: { cookie: adminCookie },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // 관리자 목록에서도 사라짐 (hard delete)
      const listResponse = await app.inject({
        method: "GET",
        url: "/admin/comments",
        headers: { cookie: adminCookie },
      });
      expect(listResponse.json().data).toHaveLength(0);
    });

    it("기본 action (soft_delete) → 204", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const createResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
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
        url: `/admin/comments/${comment.id}`,
        headers: { cookie: adminCookie },
      });

      expect(deleteResponse.statusCode).toBe(204);
    });
  });

  // ===== DELETE /admin/comments/bulk =====

  describe("DELETE /admin/comments/bulk", () => {
    it("벌크 hide → 204, active 상태만 hidden으로 전환", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const csrfToken = (
        await app.inject({
          method: "GET",
          url: "/auth/csrf-token",
          headers: { cookie: adminCookie },
        })
      ).json().token;

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const activeComment = await seedComment(post.id, {
        body: "활성 댓글",
        status: "active",
      });
      const deletedComment = await seedComment(post.id, {
        body: "삭제 댓글",
        status: "deleted",
        deletedAt: new Date(),
      });

      const bulkResponse = await app.inject({
        method: "DELETE",
        url: "/admin/comments/bulk",
        headers: {
          cookie: adminCookie,
          "x-csrf-token": csrfToken,
        },
        payload: {
          ids: [activeComment.id, deletedComment.id],
          action: "hide",
        },
      });

      expect(bulkResponse.statusCode).toBe(204);

      const comments = await db
        .select()
        .from(commentTable)
        .where(inArray(commentTable.id, [activeComment.id, deletedComment.id]));

      expect(comments).toHaveLength(2);
      expect(
        comments.find((comment) => comment.id === activeComment.id)?.status,
      ).toBe("hidden");
      expect(
        comments.find((comment) => comment.id === deletedComment.id)?.status,
      ).toBe("deleted");
    });

    it("벌크 soft_delete → 204, deleted 상태로 전환", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const csrfToken = (
        await app.inject({
          method: "GET",
          url: "/auth/csrf-token",
          headers: { cookie: adminCookie },
        })
      ).json().token;

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const ids: number[] = [];
      for (let i = 1; i <= 3; i++) {
        const r = await app.inject({
          method: "POST",
          url: `/posts/${post.id}/comments`,
          payload: {
            body: `댓글 ${i}`,
            guestName: `작성자${i}`,
            guestEmail: `u${i}@example.com`,
            guestPassword: "pass1234",
          },
        });
        ids.push(r.json().data.id);
      }

      const bulkResponse = await app.inject({
        method: "DELETE",
        url: "/admin/comments/bulk",
        headers: {
          cookie: adminCookie,
          "x-csrf-token": csrfToken,
        },
        payload: { ids, action: "soft_delete" },
      });

      expect(bulkResponse.statusCode).toBe(204);

      const listResponse = await app.inject({
        method: "GET",
        url: "/admin/comments?status=deleted",
        headers: { cookie: adminCookie },
      });
      expect(listResponse.json().data).toHaveLength(3);
    });

    it("벌크 restore → 204, active 상태로 복원", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const csrfToken = (
        await app.inject({
          method: "GET",
          url: "/auth/csrf-token",
          headers: { cookie: adminCookie },
        })
      ).json().token;

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const ids: number[] = [];
      for (let i = 1; i <= 2; i++) {
        const r = await app.inject({
          method: "POST",
          url: `/posts/${post.id}/comments`,
          payload: {
            body: `댓글 ${i}`,
            guestName: `작성자${i}`,
            guestEmail: `u${i}@example.com`,
            guestPassword: "pass1234",
          },
        });
        ids.push(r.json().data.id);
      }

      // 먼저 soft_delete
      await app.inject({
        method: "DELETE",
        url: "/admin/comments/bulk",
        headers: {
          cookie: adminCookie,
          "x-csrf-token": csrfToken,
        },
        payload: { ids, action: "soft_delete" },
      });

      // 복원
      const restoreResponse = await app.inject({
        method: "DELETE",
        url: "/admin/comments/bulk",
        headers: {
          cookie: adminCookie,
          "x-csrf-token": csrfToken,
        },
        payload: { ids, action: "restore" },
      });

      expect(restoreResponse.statusCode).toBe(204);

      const listResponse = await app.inject({
        method: "GET",
        url: "/admin/comments?status=active",
        headers: { cookie: adminCookie },
      });
      expect(listResponse.json().data).toHaveLength(2);
    });

    it("벌크 restore → hidden/deleted 혼합 입력을 active로 복원", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const csrfToken = (
        await app.inject({
          method: "GET",
          url: "/auth/csrf-token",
          headers: { cookie: adminCookie },
        })
      ).json().token;

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const deletedComment = await seedComment(post.id, {
        body: "삭제 댓글",
        status: "deleted",
        deletedAt: new Date(),
      });
      const hiddenComment = await seedComment(post.id, {
        body: "숨김 댓글",
        status: "hidden",
      });

      const restoreResponse = await app.inject({
        method: "DELETE",
        url: "/admin/comments/bulk",
        headers: {
          cookie: adminCookie,
          "x-csrf-token": csrfToken,
        },
        payload: {
          ids: [deletedComment.id, hiddenComment.id],
          action: "restore",
        },
      });

      expect(restoreResponse.statusCode).toBe(204);

      const restoredComments = await db
        .select()
        .from(commentTable)
        .where(inArray(commentTable.id, [deletedComment.id, hiddenComment.id]));

      expect(restoredComments).toHaveLength(2);
      expect(restoredComments.map((comment) => comment.status)).toEqual(
        expect.arrayContaining(["active", "active"]),
      );
      expect(restoredComments.every((comment) => comment.deletedAt === null)).toBe(
        true,
      );
    });

    it("벌크 hard_delete → 204, 대댓글 cascade 삭제", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const csrfToken = (
        await app.inject({
          method: "GET",
          url: "/auth/csrf-token",
          headers: { cookie: adminCookie },
        })
      ).json().token;

      const category = await seedCategory();
      const post = await seedPost(category.id, {
        status: "published",
        visibility: "public",
      });

      const rootResponse = await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "루트 댓글",
          guestName: "부모",
          guestEmail: "parent@example.com",
          guestPassword: "pass1234",
        },
      });
      const rootComment = rootResponse.json().data;

      // 답글 추가
      await app.inject({
        method: "POST",
        url: `/posts/${post.id}/comments`,
        payload: {
          body: "답글",
          parentId: rootComment.id,
          guestName: "자식",
          guestEmail: "child@example.com",
          guestPassword: "pass1234",
        },
      });

      const bulkResponse = await app.inject({
        method: "DELETE",
        url: "/admin/comments/bulk",
        headers: {
          cookie: adminCookie,
          "x-csrf-token": csrfToken,
        },
        payload: { ids: [rootComment.id], action: "hard_delete" },
      });

      expect(bulkResponse.statusCode).toBe(204);

      // 루트 + 대댓글 모두 삭제됨
      const listResponse = await app.inject({
        method: "GET",
        url: "/admin/comments",
        headers: { cookie: adminCookie },
      });
      expect(listResponse.json().data).toHaveLength(0);
    });
  });
});
