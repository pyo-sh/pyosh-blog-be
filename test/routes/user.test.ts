import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  cleanup,
  injectOAuthUser,
} from "@test/helpers/app";
import { seedOAuthUser, truncateAll, seedCategory, seedPost } from "@test/helpers/seed";
import { db } from "@src/db/client";
import { oauthAccountTable, commentTable, guestbookEntryTable } from "@src/db/schema";

describe("User Routes (/api/user)", () => {
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

  // ===== GET /api/user/me =====

  describe("GET /api/user/me", () => {
    it("인증된 OAuth 유저 → 200 + 프로필 반환", async () => {
      const user = await seedOAuthUser({
        displayName: "테스트 유저",
        email: "test@example.com",
        provider: "github",
      });
      const cookie = await injectOAuthUser(user.id);

      const response = await app.inject({
        method: "GET",
        url: "/api/user/me",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.id).toBe(user.id);
      expect(body.displayName).toBe("테스트 유저");
      expect(body.email).toBe("test@example.com");
      expect(body.provider).toBe("github");
      // 민감 필드 노출 안 함
      expect(body).not.toHaveProperty("providerUserId");
      expect(body).not.toHaveProperty("deletedAt");
    });

    it("인증 없이 접근 → 401", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/user/me",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ===== PUT /api/user/me =====

  describe("PUT /api/user/me", () => {
    it("displayName 수정 → 200 + 수정된 프로필", async () => {
      const user = await seedOAuthUser({ displayName: "이전 이름" });
      const cookie = await injectOAuthUser(user.id);

      const response = await app.inject({
        method: "PUT",
        url: "/api/user/me",
        headers: { cookie },
        payload: { displayName: "새 이름" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().displayName).toBe("새 이름");
    });

    it("avatarUrl null로 수정 (아바타 제거) → 200", async () => {
      const user = await seedOAuthUser({
        avatarUrl: "https://example.com/avatar.png",
      });
      const cookie = await injectOAuthUser(user.id);

      const response = await app.inject({
        method: "PUT",
        url: "/api/user/me",
        headers: { cookie },
        payload: { avatarUrl: null },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().avatarUrl).toBeNull();
    });

    it("빈 body 전송 → 200 (변경 없음)", async () => {
      const user = await seedOAuthUser({ displayName: "변경 없음" });
      const cookie = await injectOAuthUser(user.id);

      const response = await app.inject({
        method: "PUT",
        url: "/api/user/me",
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().displayName).toBe("변경 없음");
    });

    it("인증 없이 접근 → 401", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/api/user/me",
        payload: { displayName: "테스트" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ===== DELETE /api/user/me =====

  describe("DELETE /api/user/me", () => {
    it("회원 탈퇴 → 204 + deletedAt 설정", async () => {
      const user = await seedOAuthUser();
      const cookie = await injectOAuthUser(user.id);

      const response = await app.inject({
        method: "DELETE",
        url: "/api/user/me",
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);

      // deletedAt이 설정되어 있는지 확인
      const [updated] = await db
        .select({ deletedAt: oauthAccountTable.deletedAt })
        .from(oauthAccountTable)
        .where(eq(oauthAccountTable.id, user.id));

      expect(updated?.deletedAt).not.toBeNull();
    });

    it("탈퇴 후 세션 파기 → GET /api/user/me 401", async () => {
      const user = await seedOAuthUser();
      const cookie = await injectOAuthUser(user.id);

      await app.inject({
        method: "DELETE",
        url: "/api/user/me",
        headers: { cookie },
      });

      // 동일 세션으로 재접근
      const meResponse = await app.inject({
        method: "GET",
        url: "/api/user/me",
        headers: { cookie },
      });

      expect(meResponse.statusCode).toBe(401);
    });

    it("인증 없이 접근 → 401", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/user/me",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ===== T6. 탈퇴 유저 댓글 마스킹 =====

  describe("탈퇴 유저 댓글 마스킹", () => {
    it("탈퇴 유저의 댓글 → author가 '탈퇴한 사용자'로 마스킹", async () => {
      const user = await seedOAuthUser({ displayName: "탈퇴 예정 유저" });
      const category = await seedCategory();
      const post = await seedPost(category.id);

      // 댓글 작성
      await db.insert(commentTable).values({
        postId: post.id,
        authorType: "oauth",
        oauthAccountId: user.id,
        body: "탈퇴 전 작성한 댓글",
        isSecret: false,
        status: "active",
        depth: 0,
      });

      // 유저 soft delete
      await db
        .update(oauthAccountTable)
        .set({ deletedAt: new Date() })
        .where(eq(oauthAccountTable.id, user.id));

      const response = await app.inject({
        method: "GET",
        url: `/api/posts/${post.id}/comments`,
      });

      expect(response.statusCode).toBe(200);
      const comments = response.json().data;
      expect(comments[0].author.name).toBe("탈퇴한 사용자");
      expect(comments[0].author.avatarUrl).toBeUndefined();
      expect(comments[0].author.id).toBeUndefined();
    });

    it("탈퇴 유저의 방명록 → author가 '탈퇴한 사용자'로 마스킹", async () => {
      const user = await seedOAuthUser({ displayName: "탈퇴 예정 유저" });

      // 방명록 작성
      await db.insert(guestbookEntryTable).values({
        authorType: "oauth",
        oauthAccountId: user.id,
        body: "탈퇴 전 작성한 방명록",
        isSecret: false,
        status: "active",
      });

      // 유저 soft delete
      await db
        .update(oauthAccountTable)
        .set({ deletedAt: new Date() })
        .where(eq(oauthAccountTable.id, user.id));

      const response = await app.inject({
        method: "GET",
        url: "/api/guestbook",
      });

      expect(response.statusCode).toBe(200);
      const entries = response.json().data;
      expect(entries[0].author.name).toBe("탈퇴한 사용자");
      expect(entries[0].author.avatarUrl).toBeUndefined();
      expect(entries[0].author.id).toBeUndefined();
    });
  });
});
