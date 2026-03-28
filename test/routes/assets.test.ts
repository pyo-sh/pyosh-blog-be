import * as fs from "fs/promises";
import * as path from "path";
import { FastifyInstance } from "fastify";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createTestApp, cleanup, injectAuth } from "@test/helpers/app";
import { seedAdmin, seedAsset, truncateAll } from "@test/helpers/seed";

/** 1x1 PNG (base64) */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG = Buffer.from(TINY_PNG_BASE64, "base64");
const SAFE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" /></svg>',
);
const UNSAFE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>',
);
const FAKE_WEBP = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WAVE", "ascii"),
  Buffer.alloc(32, 0),
]);

/**
 * multipart/form-data 본문 빌더
 */
function buildMultipart(
  files: Array<{
    fieldName: string;
    fileName: string;
    content: Buffer;
    mimeType: string;
  }>,
  boundary: string,
): Buffer {
  const parts: Buffer[] = [];
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
      ),
    );
    parts.push(file.content);
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

describe("Asset Routes", () => {
  let app: FastifyInstance;
  let authCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanup(app);
  });

  beforeEach(async () => {
    await truncateAll();
    await seedAdmin();
    authCookie = await injectAuth(app);
  });

  // ===== GET /api/assets =====

  describe("GET /api/assets", () => {
    it("인증 없이 → 403", async () => {
      const res = await app.inject({ method: "GET", url: "/api/assets" });
      expect(res.statusCode).toBe(403);
    });

    it("빈 목록 → 200 + data[]", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/assets",
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it("페이지네이션 meta 검증", async () => {
      await Promise.all([seedAsset(), seedAsset(), seedAsset()]);

      const res = await app.inject({
        method: "GET",
        url: "/api/assets?page=1&limit=2",
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(2);
      expect(body.meta).toMatchObject({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });
  });

  // ===== POST /api/assets/upload =====

  describe("POST /api/assets/upload", () => {
    afterEach(async () => {
      // 업로드된 파일 정리
      const uploadDir =
        process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
      try {
        await fs.rm(uploadDir, { recursive: true, force: true });
      } catch {
        // 무시
      }
    });

    it("인증 없이 → 403", async () => {
      const boundary = "testboundary";
      const payload = buildMultipart(
        [{ fieldName: "files", fileName: "a.png", content: TINY_PNG, mimeType: "image/png" }],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/api/assets/upload",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it("PNG 업로드 → 201 + width/height 추출", async () => {
      const boundary = "testboundary";
      const payload = buildMultipart(
        [{ fieldName: "files", fileName: "test.png", content: TINY_PNG, mimeType: "image/png" }],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/api/assets/upload",
        headers: {
          cookie: authCookie,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.assets).toHaveLength(1);
      const asset = body.assets[0];
      expect(asset.mimeType).toBe("image/png");
      expect(asset.url).toMatch(/^\/uploads\/\d{4}\/\d{2}\//);
      expect(asset.width).toBe(1);
      expect(asset.height).toBe(1);
    });

    it("안전한 SVG 업로드 → 201", async () => {
      const boundary = "testboundary";
      const payload = buildMultipart(
        [{ fieldName: "files", fileName: "safe.svg", content: SAFE_SVG, mimeType: "image/svg+xml" }],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/api/assets/upload",
        headers: {
          cookie: authCookie,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.assets).toHaveLength(1);
      expect(body.assets[0].mimeType).toBe("image/svg+xml");
    });

    it("active content가 포함된 SVG → 400", async () => {
      const boundary = "testboundary";
      const payload = buildMultipart(
        [{ fieldName: "files", fileName: "unsafe.svg", content: UNSAFE_SVG, mimeType: "image/svg+xml" }],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/api/assets/upload",
        headers: {
          cookie: authCookie,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("RIFF 기반 비-WebP 파일을 WebP로 위장하면 → 400", async () => {
      const boundary = "testboundary";
      const payload = buildMultipart(
        [{ fieldName: "files", fileName: "fake.webp", content: FAKE_WEBP, mimeType: "image/webp" }],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/api/assets/upload",
        headers: {
          cookie: authCookie,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("허용되지 않은 MIME → 400", async () => {
      const boundary = "testboundary";
      const payload = buildMultipart(
        [{ fieldName: "files", fileName: "test.txt", content: Buffer.from("hello"), mimeType: "text/plain" }],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/api/assets/upload",
        headers: {
          cookie: authCookie,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("파일 없이 → 400", async () => {
      const boundary = "testboundary";
      const payload = Buffer.from(`--${boundary}--\r\n`);
      const res = await app.inject({
        method: "POST",
        url: "/api/assets/upload",
        headers: {
          cookie: authCookie,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("파일 크기 초과 → 413", async () => {
      const boundary = "testboundary";
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      const payload = buildMultipart(
        [{ fieldName: "files", fileName: "big.png", content: largeBuffer, mimeType: "image/png" }],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/api/assets/upload",
        headers: {
          cookie: authCookie,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(413);
    });
  });

  // ===== GET /api/assets/:id =====

  describe("GET /api/assets/:id", () => {
    it("존재하는 asset → 200", async () => {
      const asset = await seedAsset({ width: 800, height: 600 });
      const res = await app.inject({
        method: "GET",
        url: `/api/assets/${asset.id}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(asset.id);
      expect(body.url).toBe(`/uploads/${asset.storageKey}`);
      expect(body.width).toBe(800);
      expect(body.height).toBe(600);
    });

    it("없는 id → 404", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/assets/999999",
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ===== DELETE /api/assets/:id =====

  describe("DELETE /api/assets/:id", () => {
    it("인증 없이 → 403", async () => {
      const asset = await seedAsset();
      const res = await app.inject({
        method: "DELETE",
        url: `/api/assets/${asset.id}`,
      });
      expect(res.statusCode).toBe(403);
    });

    it("존재하는 asset 삭제 → 204", async () => {
      const asset = await seedAsset();
      const res = await app.inject({
        method: "DELETE",
        url: `/api/assets/${asset.id}`,
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(204);

      // 삭제 후 조회 → 404
      const check = await app.inject({
        method: "GET",
        url: `/api/assets/${asset.id}`,
      });
      expect(check.statusCode).toBe(404);
    });

    it("없는 id → 404", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/assets/999999",
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ===== DELETE /api/assets/bulk =====

  describe("DELETE /api/assets/bulk", () => {
    it("인증 없이 → 403", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/assets/bulk",
        payload: { ids: [1] },
      });
      expect(res.statusCode).toBe(403);
    });

    it("벌크 삭제 → 204, DB에서 모두 제거", async () => {
      const [a1, a2, a3] = await Promise.all([
        seedAsset(),
        seedAsset(),
        seedAsset(),
      ]);

      const res = await app.inject({
        method: "DELETE",
        url: "/api/assets/bulk",
        headers: { cookie: authCookie },
        payload: { ids: [a1.id, a2.id] },
      });
      expect(res.statusCode).toBe(204);

      // 삭제된 id 조회 → 404
      const check1 = await app.inject({ method: "GET", url: `/api/assets/${a1.id}` });
      const check2 = await app.inject({ method: "GET", url: `/api/assets/${a2.id}` });
      expect(check1.statusCode).toBe(404);
      expect(check2.statusCode).toBe(404);

      // 삭제 안 된 id는 유지
      const check3 = await app.inject({ method: "GET", url: `/api/assets/${a3.id}` });
      expect(check3.statusCode).toBe(200);
    });

    it("ids 없이 → 400", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/assets/bulk",
        headers: { cookie: authCookie },
        payload: { ids: [] },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
