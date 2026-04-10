import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestApp,
  cleanup,
  injectAuth,
  injectOAuthUser,
} from "@test/helpers/app";
import { db } from "@src/db/client";
import { guestbookEntryTable } from "@src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { seedAdmin, seedOAuthUser, truncateAll } from "@test/helpers/seed";

describe("Guestbook Routes", () => {
  let app: FastifyInstance;

  async function getCsrfHeaders(cookie?: string): Promise<Record<string, string>> {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/csrf-token",
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

  // ===== POST /api/guestbook =====

  describe("POST /api/guestbook", () => {
    it("게스트 방명록 작성 → 201", async () => {
      const csrfHeaders = await getCsrfHeaders();
      const response = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: csrfHeaders,
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
      const user = await seedOAuthUser({ displayName: "OAuth Visitor" });
      const cookie = await injectOAuthUser(user.id);
      const csrfHeaders = await getCsrfHeaders(cookie);

      const response = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: csrfHeaders,
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
      const parentHeaders = await getCsrfHeaders();

      // 부모 방명록 작성
      const parentResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: parentHeaders,
        payload: {
          body: "부모 방명록",
          guestName: "부모",
          guestEmail: "parent@example.com",
          guestPassword: "pass1234",
        },
      });
      expect(parentResponse.statusCode).toBe(201);
      const parentEntry = parentResponse.json().data;
      const replyHeaders = await getCsrfHeaders();

      // 대댓글 작성
      const replyResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: replyHeaders,
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
      const firstHeaders = await getCsrfHeaders();

      // 부모 방명록 2개 + 대댓글 1개 작성
      const p1Response = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: firstHeaders,
        payload: {
          body: "첫 번째 방명록",
          guestName: "A",
          guestEmail: "a@example.com",
          guestPassword: "pass1234",
        },
      });
      const entry1 = p1Response.json().data;
      const secondHeaders = await getCsrfHeaders();

      await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: secondHeaders,
        payload: {
          body: "두 번째 방명록",
          guestName: "B",
          guestEmail: "b@example.com",
          guestPassword: "pass1234",
        },
      });
      const replyHeaders = await getCsrfHeaders();

      await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: replyHeaders,
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
      const createHeaders = await getCsrfHeaders();

      // 방명록 작성
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: createHeaders,
        payload: {
          body: "삭제될 방명록",
          guestName: "삭제자",
          guestEmail: "delete@example.com",
          guestPassword: "deletepass123",
        },
      });
      const entry = createResponse.json().data;
      const deleteHeaders = await getCsrfHeaders();

      // 비밀번호로 삭제
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/guestbook/${entry.id}`,
        headers: deleteHeaders,
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
      const userA = await seedOAuthUser({ displayName: "User A" });
      const cookieA = await injectOAuthUser(userA.id);
      const headersA = await getCsrfHeaders(cookieA);

      const userB = await seedOAuthUser({ displayName: "User B" });
      const cookieB = await injectOAuthUser(userB.id);
      const headersB = await getCsrfHeaders(cookieB);

      // User A가 방명록 작성
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: headersA,
        payload: { body: "User A의 방명록" },
      });
      const entry = createResponse.json().data;

      // User B가 삭제 시도 → 403
      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/guestbook/${entry.id}`,
        headers: headersB,
      });

      expect(deleteResponse.statusCode).toBe(403);
    });
  });

  // ===== GET /api/admin/guestbook =====

  describe("GET /api/admin/guestbook", () => {
    it("관리자 인증 없이 접근 → 403", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/guestbook",
      });

      expect(response.statusCode).toBe(403);
    });

    it("전체 방명록 목록 조회 → 페이지네이션 구조 확인", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const firstHeaders = await getCsrfHeaders();
      const secondHeaders = await getCsrfHeaders();

      // 방명록 2개 작성
      await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: firstHeaders,
        payload: {
          body: "첫 번째 방명록",
          guestName: "방문자1",
          guestEmail: "a@example.com",
          guestPassword: "pass1234",
        },
      });
      await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: secondHeaders,
        payload: {
          body: "두 번째 방명록",
          guestName: "방문자2",
          guestEmail: "b@example.com",
          guestPassword: "pass1234",
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/guestbook",
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(2);
      expect(body.meta.total).toBe(2);
      expect(body.meta.page).toBe(1);
    });

    it("authorType 필터 적용 → guest만 반환", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const user = await seedOAuthUser({ displayName: "OAuth Visitor" });
      const userCookie = await injectOAuthUser(user.id);
      const userHeaders = await getCsrfHeaders(userCookie);
      const guestHeaders = await getCsrfHeaders();

      // OAuth 방명록
      await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: userHeaders,
        payload: { body: "OAuth 방명록" },
      });

      // Guest 방명록
      await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: guestHeaders,
        payload: {
          body: "게스트 방명록",
          guestName: "게스트",
          guestEmail: "g@example.com",
          guestPassword: "pass1234",
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/guestbook?authorType=guest",
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].author.type).toBe("guest");
    });

    it("비밀 방명록도 원문 반환 (마스킹 없음)", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);

      const user = await seedOAuthUser({ displayName: "Secret Writer" });
      const userCookie = await injectOAuthUser(user.id);
      const userHeaders = await getCsrfHeaders(userCookie);

      await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: userHeaders,
        payload: {
          body: "비밀 방명록 원문",
          isSecret: true,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/admin/guestbook",
        headers: { cookie: adminCookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data[0].body).toBe("비밀 방명록 원문");
    });
  });

  // ===== DELETE /api/admin/guestbook/:id =====

  describe("DELETE /api/admin/guestbook/:id", () => {
    it("관리자 강제 삭제 → 204", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const createHeaders = await getCsrfHeaders();
      const adminHeaders = await getCsrfHeaders(adminCookie);

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: createHeaders,
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
        url: `/api/admin/guestbook/${entry.id}?action=soft_delete`,
        headers: adminHeaders,
      });

      expect(deleteResponse.statusCode).toBe(204);
    });
  });

  // ===== PATCH /api/admin/guestbook/:id =====

  describe("PATCH /api/admin/guestbook/:id", () => {
    it("active 방명록 숨김 후 hidden 상태만 restore → 204", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const createHeaders = await getCsrfHeaders();
      const adminHeaders = await getCsrfHeaders(adminCookie);

      const createResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: createHeaders,
        payload: {
          body: "상태 변경 대상",
          guestName: "작성자",
          guestEmail: "writer@example.com",
          guestPassword: "pass1234",
        },
      });
      const entry = createResponse.json().data;

      const hideResponse = await app.inject({
        method: "PATCH",
        url: `/api/admin/guestbook/${entry.id}?action=hide`,
        headers: adminHeaders,
      });

      expect(hideResponse.statusCode).toBe(204);

      let [row] = await db
        .select({ status: guestbookEntryTable.status })
        .from(guestbookEntryTable)
        .where(eq(guestbookEntryTable.id, entry.id));

      expect(row?.status).toBe("hidden");

      const restoreResponse = await app.inject({
        method: "PATCH",
        url: `/api/admin/guestbook/${entry.id}?action=restore`,
        headers: adminHeaders,
      });

      expect(restoreResponse.statusCode).toBe(204);

      [row] = await db
        .select({ status: guestbookEntryTable.status })
        .from(guestbookEntryTable)
        .where(eq(guestbookEntryTable.id, entry.id));

      expect(row?.status).toBe("active");
    });
  });

  // ===== DELETE /api/admin/guestbook/bulk =====

  describe("DELETE /api/admin/guestbook/bulk", () => {
    it("벌크 soft_delete → 204, deleted 상태로 전환", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const firstHeaders = await getCsrfHeaders();
      const secondHeaders = await getCsrfHeaders();
      const adminHeaders = await getCsrfHeaders(adminCookie);

      const firstResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: firstHeaders,
        payload: {
          body: "첫 번째 벌크 삭제",
          guestName: "작성자1",
          guestEmail: "writer1@example.com",
          guestPassword: "pass1234",
        },
      });
      const secondResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: secondHeaders,
        payload: {
          body: "두 번째 벌크 삭제",
          guestName: "작성자2",
          guestEmail: "writer2@example.com",
          guestPassword: "pass1234",
        },
      });

      const ids = [firstResponse.json().data.id, secondResponse.json().data.id];
      const response = await app.inject({
        method: "DELETE",
        url: "/api/admin/guestbook/bulk",
        headers: adminHeaders,
        payload: { ids, action: "soft_delete" },
      });

      expect(response.statusCode).toBe(204);

      const rows = await db
        .select({ id: guestbookEntryTable.id, status: guestbookEntryTable.status })
        .from(guestbookEntryTable)
        .where(inArray(guestbookEntryTable.id, ids));

      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.status === "deleted")).toBe(true);
    });
  });

  // ===== PATCH /api/admin/guestbook/bulk =====

  describe("PATCH /api/admin/guestbook/bulk", () => {
    it("벌크 hide/restore → 상태 조건에 맞는 엔트리만 변경", async () => {
      await seedAdmin();
      const adminCookie = await injectAuth(app);
      const firstHeaders = await getCsrfHeaders();
      const secondHeaders = await getCsrfHeaders();
      const adminHeaders = await getCsrfHeaders(adminCookie);

      const activeResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: firstHeaders,
        payload: {
          body: "active 엔트리",
          guestName: "작성자1",
          guestEmail: "writer1@example.com",
          guestPassword: "pass1234",
        },
      });
      const deletedResponse = await app.inject({
        method: "POST",
        url: "/api/guestbook",
        headers: secondHeaders,
        payload: {
          body: "deleted 엔트리",
          guestName: "작성자2",
          guestEmail: "writer2@example.com",
          guestPassword: "pass1234",
        },
      });

      const activeId = activeResponse.json().data.id;
      const deletedId = deletedResponse.json().data.id;

      await app.inject({
        method: "DELETE",
        url: `/api/admin/guestbook/${deletedId}?action=soft_delete`,
        headers: adminHeaders,
      });

      const hideResponse = await app.inject({
        method: "PATCH",
        url: "/api/admin/guestbook/bulk",
        headers: adminHeaders,
        payload: { ids: [activeId, deletedId], action: "hide" },
      });

      expect(hideResponse.statusCode).toBe(204);

      let rows = await db
        .select({ id: guestbookEntryTable.id, status: guestbookEntryTable.status })
        .from(guestbookEntryTable)
        .where(inArray(guestbookEntryTable.id, [activeId, deletedId]));

      expect(rows.find((row) => row.id === activeId)?.status).toBe("hidden");
      expect(rows.find((row) => row.id === deletedId)?.status).toBe("deleted");

      const restoreResponse = await app.inject({
        method: "PATCH",
        url: "/api/admin/guestbook/bulk",
        headers: adminHeaders,
        payload: { ids: [activeId, deletedId], action: "restore" },
      });

      expect(restoreResponse.statusCode).toBe(204);

      rows = await db
        .select({ id: guestbookEntryTable.id, status: guestbookEntryTable.status })
        .from(guestbookEntryTable)
        .where(inArray(guestbookEntryTable.id, [activeId, deletedId]));

      expect(rows.find((row) => row.id === activeId)?.status).toBe("active");
      expect(rows.find((row) => row.id === deletedId)?.status).toBe("deleted");
    });
  });
});
