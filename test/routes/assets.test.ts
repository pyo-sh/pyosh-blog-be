import * as fs from "fs/promises";
import * as path from "path";
import { FastifyInstance } from "fastify";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { getUploadDir } from "@src/shared/uploads";
import { createTestApp, cleanup, injectAuth } from "@test/helpers/app";
import {
  seedAdmin,
  seedAsset,
  seedAssetCategory,
  truncateAll,
} from "@test/helpers/seed";

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
const ENCODED_UNSAFE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#x6a;avascript:alert(1)">x</a></svg>',
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
  fields: Array<{ name: string; value: string }> = [],
): Buffer {
  const parts: Buffer[] = [];
  for (const field of fields) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`,
      ),
    );
  }
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

function expectRouteHasOnRequestHook(
  tree: string,
  route: string,
  method: "POST" | "DELETE",
) {
  const lines = tree.trimEnd().split("\n");
  const routeIndex = lines.findIndex((line) =>
    line.includes(`${route} (${method})`),
  );

  expect(routeIndex).toBeGreaterThanOrEqual(0);
  expect(lines[routeIndex + 1]).toContain("• (onRequest)");
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

  // ===== GET /assets =====

  describe("GET /assets", () => {
    it("인증 없이 → 403", async () => {
      const res = await app.inject({ method: "GET", url: "/assets" });
      expect(res.statusCode).toBe(403);
    });

    it("빈 목록 → 200 + data[]", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/assets",
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
        url: "/assets?page=1&limit=2",
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

    it("categoryId와 q로 목록 필터링", async () => {
      const thumbnail = await seedAssetCategory({
        name: "Thumbnails",
        key: "thumbnail-test",
        isProtected: true,
      });
      const article = await seedAssetCategory({ name: "Article Images" });
      await seedAsset({
        categoryId: thumbnail.id,
        displayName: "Hero Thumbnail",
        storageKey: "2026/01/hero-thumb.png",
      });
      await seedAsset({
        categoryId: article.id,
        displayName: "본문 이미지",
        storageKey: "2026/01/body-image.png",
      });

      const res = await app.inject({
        method: "GET",
        url: `/assets?categoryId=${thumbnail.id}&q=Hero`,
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        displayName: "Hero Thumbnail",
        category: { id: thumbnail.id, name: "Thumbnails" },
      });
    });
  });

  // ===== /assets/categories =====

  describe("/assets/categories", () => {
    it("기본 보호 카테고리 3개를 보장한다", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/assets/categories",
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: "thumbnail",
            name: "썸네일",
            isProtected: true,
          }),
          expect.objectContaining({
            key: "default",
            name: "기본",
            isProtected: true,
          }),
          expect.objectContaining({
            key: "uncategorized",
            name: "미분류",
            isProtected: true,
          }),
        ]),
      );
    });

    it("사용자 카테고리 생성/수정 → 201/200", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/assets/categories",
        headers: { cookie: authCookie },
        payload: { name: "본문" },
      });

      expect(createRes.statusCode).toBe(201);
      const created = createRes.json();
      expect(created).toMatchObject({
        key: null,
        name: "본문",
        isProtected: false,
      });

      const updateRes = await app.inject({
        method: "PATCH",
        url: `/assets/categories/${created.id}`,
        headers: { cookie: authCookie },
        payload: { name: "본문 이미지", sortOrder: 10 },
      });

      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json()).toMatchObject({
        id: created.id,
        name: "본문 이미지",
        sortOrder: 10,
      });
    });

    it("보호 카테고리는 삭제할 수 없다", async () => {
      const listRes = await app.inject({
        method: "GET",
        url: "/assets/categories",
        headers: { cookie: authCookie },
      });
      const thumbnail = listRes
        .json()
        .data.find((category: { key: string }) => category.key === "thumbnail");

      const res = await app.inject({
        method: "DELETE",
        url: `/assets/categories/${thumbnail.id}`,
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(400);
    });

    it("사용자 카테고리 삭제 시 연결 에셋은 미분류로 이동한다", async () => {
      const category = await seedAssetCategory({ name: "Delete Me" });
      const asset = await seedAsset({ categoryId: category.id });

      const res = await app.inject({
        method: "DELETE",
        url: `/assets/categories/${category.id}`,
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(204);

      const assetRes = await app.inject({
        method: "GET",
        url: `/assets/${asset.id}`,
      });
      expect(assetRes.statusCode).toBe(200);
      expect(assetRes.json().category).toMatchObject({
        key: "uncategorized",
        name: "미분류",
      });
    });
  });

  // ===== POST /assets/upload =====

  describe("POST /assets/upload", () => {
    afterEach(async () => {
      // 업로드된 파일 정리
      const uploadDir = getUploadDir();
      try {
        await fs.rm(uploadDir, { recursive: true, force: true });
      } catch {
        // 무시
      }
    });

    it("route에 CSRF onRequest hook 등록", () => {
      const routes = app.printRoutes({
        commonPrefix: false,
        includeHooks: true,
        method: "POST",
      });

      expectRouteHasOnRequestHook(routes, "/assets/upload", "POST");
    });

    it("인증 없이 → 403", async () => {
      const boundary = "testboundary";
      const payload = buildMultipart(
        [
          {
            fieldName: "files",
            fileName: "a.png",
            content: TINY_PNG,
            mimeType: "image/png",
          },
        ],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/assets/upload",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(403);
    });

    it("PNG 업로드 → 201 + width/height 추출", async () => {
      const boundary = "testboundary";
      const payload = buildMultipart(
        [
          {
            fieldName: "files",
            fileName: "test.png",
            content: TINY_PNG,
            mimeType: "image/png",
          },
        ],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/assets/upload",
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
      expect(asset.displayName).toBeNull();
      expect(asset.category).toMatchObject({ key: "default", name: "기본" });
    });

    it("파일별 displayName/categoryId 메타데이터를 저장한다", async () => {
      const category = await seedAssetCategory({ name: "Upload Target" });
      const boundary = "testboundary";
      const payload = buildMultipart(
        [
          {
            fieldName: "files",
            fileName: "named.png",
            content: TINY_PNG,
            mimeType: "image/png",
          },
        ],
        boundary,
        [
          {
            name: "metadata",
            value: JSON.stringify([
              { displayName: "대표 이미지", categoryId: category.id },
            ]),
          },
        ],
      );
      const res = await app.inject({
        method: "POST",
        url: "/assets/upload",
        headers: {
          cookie: authCookie,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(res.statusCode).toBe(201);
      const asset = res.json().assets[0];
      expect(asset).toMatchObject({
        displayName: "대표 이미지",
        category: { id: category.id, name: "Upload Target" },
      });
    });

    it("업로드 후 반환된 /uploads URL로 정적 접근 가능", async () => {
      const boundary = "testboundary";
      const payload = buildMultipart(
        [
          {
            fieldName: "files",
            fileName: "served.png",
            content: TINY_PNG,
            mimeType: "image/png",
          },
        ],
        boundary,
      );
      const uploadRes = await app.inject({
        method: "POST",
        url: "/assets/upload",
        headers: {
          cookie: authCookie,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(uploadRes.statusCode).toBe(201);
      const body = uploadRes.json();
      const asset = body.assets[0];
      const relativePath = asset.url.replace(/^\/uploads\//, "");
      const savedFile = path.join(getUploadDir(), relativePath);

      await expect(fs.access(savedFile)).resolves.toBeUndefined();

      const staticRes = await app.inject({
        method: "GET",
        url: asset.url,
      });

      expect(staticRes.statusCode).toBe(200);
      expect(staticRes.headers["content-type"]).toContain("image/png");
      expect(Number(staticRes.headers["content-length"])).toBe(TINY_PNG.length);
    });

    it("안전한 SVG 업로드 → 201", async () => {
      const boundary = "testboundary";
      const payload = buildMultipart(
        [
          {
            fieldName: "files",
            fileName: "safe.svg",
            content: SAFE_SVG,
            mimeType: "image/svg+xml",
          },
        ],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/assets/upload",
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
        [
          {
            fieldName: "files",
            fileName: "unsafe.svg",
            content: UNSAFE_SVG,
            mimeType: "image/svg+xml",
          },
        ],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/assets/upload",
        headers: {
          cookie: authCookie,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(400);
    });

    it("엔티티 인코딩된 scriptable URL이 있는 SVG → 400", async () => {
      const boundary = "testboundary";
      const payload = buildMultipart(
        [
          {
            fieldName: "files",
            fileName: "encoded-unsafe.svg",
            content: ENCODED_UNSAFE_SVG,
            mimeType: "image/svg+xml",
          },
        ],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/assets/upload",
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
        [
          {
            fieldName: "files",
            fileName: "fake.webp",
            content: FAKE_WEBP,
            mimeType: "image/webp",
          },
        ],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/assets/upload",
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
        [
          {
            fieldName: "files",
            fileName: "test.txt",
            content: Buffer.from("hello"),
            mimeType: "text/plain",
          },
        ],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/assets/upload",
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
        url: "/assets/upload",
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
        [
          {
            fieldName: "files",
            fileName: "big.png",
            content: largeBuffer,
            mimeType: "image/png",
          },
        ],
        boundary,
      );
      const res = await app.inject({
        method: "POST",
        url: "/assets/upload",
        headers: {
          cookie: authCookie,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(413);
    });
  });

  // ===== GET /assets/:id =====

  describe("GET /assets/:id", () => {
    it("존재하는 asset → 200", async () => {
      const asset = await seedAsset({ width: 800, height: 600 });
      const res = await app.inject({
        method: "GET",
        url: `/assets/${asset.id}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(asset.id);
      expect(body.url).toBe(`/uploads/${asset.storageKey}`);
      expect(body.width).toBe(800);
      expect(body.height).toBe(600);
      expect(body.category.id).toBe(asset.categoryId);
    });

    it("없는 id → 404", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/assets/999999",
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ===== PATCH /assets/:id =====

  describe("PATCH /assets/:id", () => {
    it("별명과 카테고리 수정 → 200", async () => {
      const category = await seedAssetCategory({ name: "Updated Category" });
      const asset = await seedAsset();

      const res = await app.inject({
        method: "PATCH",
        url: `/assets/${asset.id}`,
        headers: { cookie: authCookie },
        payload: { displayName: "수정된 별명", categoryId: category.id },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: asset.id,
        displayName: "수정된 별명",
        category: { id: category.id, name: "Updated Category" },
      });
    });

    it("없는 카테고리로 수정하면 → 400", async () => {
      const asset = await seedAsset();
      const res = await app.inject({
        method: "PATCH",
        url: `/assets/${asset.id}`,
        headers: { cookie: authCookie },
        payload: { categoryId: 999999 },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ===== PATCH /assets/bulk/category =====

  describe("PATCH /assets/bulk/category", () => {
    it("벌크 카테고리 변경 → 204", async () => {
      const category = await seedAssetCategory({ name: "Bulk Target" });
      const [a1, a2] = await Promise.all([seedAsset(), seedAsset()]);

      const res = await app.inject({
        method: "PATCH",
        url: "/assets/bulk/category",
        headers: { cookie: authCookie },
        payload: { ids: [a1.id, a2.id], categoryId: category.id },
      });

      expect(res.statusCode).toBe(204);

      const check = await app.inject({
        method: "GET",
        url: `/assets?categoryId=${category.id}`,
        headers: { cookie: authCookie },
      });
      expect(
        check
          .json()
          .data.map((asset: { id: number }) => asset.id)
          .sort(),
      ).toEqual([a1.id, a2.id].sort());
    });
  });

  // ===== DELETE /assets/:id =====

  describe("DELETE /assets/:id", () => {
    it("route에 CSRF onRequest hook 등록", () => {
      const routes = app.printRoutes({
        commonPrefix: false,
        includeHooks: true,
        method: "DELETE",
      });

      expectRouteHasOnRequestHook(routes, "/assets/:id", "DELETE");
    });

    it("인증 없이 → 403", async () => {
      const asset = await seedAsset();
      const res = await app.inject({
        method: "DELETE",
        url: `/assets/${asset.id}`,
      });
      expect(res.statusCode).toBe(403);
    });

    it("존재하는 asset 삭제 → 204", async () => {
      const asset = await seedAsset();
      const res = await app.inject({
        method: "DELETE",
        url: `/assets/${asset.id}`,
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(204);

      // 삭제 후 조회 → 404
      const check = await app.inject({
        method: "GET",
        url: `/assets/${asset.id}`,
      });
      expect(check.statusCode).toBe(404);
    });

    it("없는 id → 404", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/assets/999999",
        headers: { cookie: authCookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ===== DELETE /assets/bulk =====

  describe("DELETE /assets/bulk", () => {
    it("route에 CSRF onRequest hook 등록", () => {
      const routes = app.printRoutes({
        commonPrefix: false,
        includeHooks: true,
        method: "DELETE",
      });

      expectRouteHasOnRequestHook(routes, "/assets/bulk", "DELETE");
    });

    it("인증 없이 → 403", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/assets/bulk",
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
        url: "/assets/bulk",
        headers: { cookie: authCookie },
        payload: { ids: [a1.id, a2.id] },
      });
      expect(res.statusCode).toBe(204);

      // 삭제된 id 조회 → 404
      const check1 = await app.inject({
        method: "GET",
        url: `/assets/${a1.id}`,
      });
      const check2 = await app.inject({
        method: "GET",
        url: `/assets/${a2.id}`,
      });
      expect(check1.statusCode).toBe(404);
      expect(check2.statusCode).toBe(404);

      // 삭제 안 된 id는 유지
      const check3 = await app.inject({
        method: "GET",
        url: `/assets/${a3.id}`,
      });
      expect(check3.statusCode).toBe(200);
    });

    it("ids 없이 → 400", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/assets/bulk",
        headers: { cookie: authCookie },
        payload: { ids: [] },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
