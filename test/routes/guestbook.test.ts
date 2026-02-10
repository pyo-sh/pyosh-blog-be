import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestApp,
  cleanup,
  injectAuth,
  injectOAuthUser,
} from "@test/helpers/app";
import { seedAdmin, seedUser, truncateAll } from "@test/helpers/seed";

describe("Guestbook Routes", () => {
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

  // ===== POST /api/guestbook =====

  describe("POST /api/guestbook", () => {
    it("게스트 방명록 작성 → 201", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        payload: {
          body: "안녕하세요! 방명록입니다.",
          guestName: "방문자",
          guestEmail: "visitor@example.com",
          guestPassword: "pass1234",
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.data.body).toBe("안녕하세요! 방명록입니다.");
      expect(body.data.author.type).toBe("guest");
      expect(body.data.author.name).toBe("방문자");
    });

    it("OAuth 사용자 방명록 작성 → 201", async () => {
      const user = await seedUser({ name: "OAuth Visitor" });
      const cookie = await injectOAuthUser(user.id);

      const response = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: { cookie },
        payload: {
          body: "OAuth로 작성한 방명록입니다.",
          isSecret: false,
        },
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.data.body).toBe("OAuth로 작성한 방명록입니다.");
      expect(body.data.author.type).toBe("oauth");
      expect(body.data.author.name).toBe("OAuth Visitor");
    });

    it("대댓글 작성 → 201", async () => {
      // 부모 방명록 작성
      const parentResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        payload: {
          body: "부모 방명록",
          guestName: "부모",
          guestEmail: "parent@example.com",
          guestPassword: "pass1234",
        },
      });
      expect(parentResponse.statusCode).toBe(201);
      const parentEntry = parentResponse.json().data;

      // 대댓글 작성
      const replyResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        payload: {
          body: "대댓글 방명록",
          parentId: parentEntry.id,
          guestName: "자식",
          guestEmail: "child@example.com",
          guestPassword: "pass5678",
        },
      });

      expect(replyResponse.statusCode).toBe(201);

      const replyBody = replyResponse.json();
      expect(replyBody.data.parentId).toBe(parentEntry.id);
    });
  });

  // ===== GET /api/guestbook =====

  describe("GET /api/guestbook", () => {
    it("목록 조회 → 계층 구조 + 페이지네이션", async () => {
      // 부모 방명록 2개 + 대댓글 1개 작성
      const p1Response = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        payload: {
          body: "첫 번째 방명록",
          guestName: "A",
          guestEmail: "a@example.com",
          guestPassword: "pass1234",
        },
      });
      const entry1 = p1Response.json().data;

      await app.inject({
        method: "POST",
        url: "/api/guestbook",
        payload: {
          body: "두 번째 방명록",
          guestName: "B",
          guestEmail: "b@example.com",
          guestPassword: "pass1234",
        },
      });

      await app.inject({
        method: "POST",
        url: "/api/guestbook",
        payload: {
          body: "첫 번째 방명록의 대댓글",
          parentId: entry1.id,
          guestName: "C",
          guestEmail: "c@example.com",
          guestPassword: "pass1234",
        },
      });

      // limit=10으로 목록 조회 (child entry 포함하여 계층 구조 확인)
      const listResponse = await app.inject({
        method: "GET",
        url: "/api/guestbook?page=1&limit=10",
      });

      expect(listResponse.statusCode).toBe(200);

      const body = listResponse.json();

      // 페이지네이션 메타 확인
      expect(body.meta).toBeDefined();
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);

      // 계층 구조 확인 (루트 방명록 2개, 첫 번째에 대댓글 1개)
      expect(body.data).toHaveLength(2);
      expect(body.data[0].replies).toHaveLength(1);
      expect(body.data[0].replies[0].body).toBe("첫 번째 방명록의 대댓글");
      expect(body.data[1].replies).toHaveLength(0);
    });
  });

  // ===== DELETE /api/guestbook/:id =====

  describe("DELETE /api/guestbook/:id", () => {
    it("게스트 삭제 (비밀번호) → 204", async () => {
      // 방명록 작성
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        payload: {
          body: "삭제될 방명록",
          guestName: "삭제자",
          guestEmail: "delete@example.com",
          guestPassword: "deletepass123",
        },
      });
      const entry = createResponse.json().data;

      // 비밀번호로 삭제
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/guestbook/${entry.id}`,
        payload: { guestPassword: "deletepass123" },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // 삭제 후 목록에서 사라짐 확인
      const listResponse = await app.inject({
        method: "GET",
        url: "/api/guestbook",
      });
      expect(listResponse.json().data).toHaveLength(0);
    });

    it("다른 사용자 삭제 시도 → 403", async () => {
      const userA = await seedUser({ name: "User A" });
      const cookieA = await injectOAuthUser(userA.id);

      const userB = await seedUser({ name: "User B" });
      const cookieB = await injectOAuthUser(userB.id);

      // User A가 방명록 작성
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: { cookie: cookieA },
        payload: { body: "User A의 방명록" },
      });
      const entry = createResponse.json().data;

      // User B가 삭제 시도 → 403
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/guestbook/${entry.id}`,
        headers: { cookie: cookieB },
      });

      expect(deleteResponse.statusCode).toBe(403);
    });
  });

  // ===== DELETE /api/admin/guestbook/:id =====

  describe("DELETE /api/admin/guestbook/:id", () => {
    it("관리자 강제 삭제 → 204", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        payload: {
          body: "관리자가 삭제할 방명록",
          guestName: "작성자",
          guestEmail: "writer@example.com",
          guestPassword: "pass1234",
        },
      });
      const entry = createResponse.json().data;

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/admin/guestbook/${entry.id}`,
        headers: { cookie: adminCookie },
      });

      expect(deleteResponse.statusCode).toBe(204);
    });
  });
});
