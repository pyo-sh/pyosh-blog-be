import { describe, expect, it } from "vitest";
import {
  generateUnicodeSlug,
  needsLegacySlugRepair,
} from "@src/shared/slug";

describe("shared/slug", () => {
  it("한글과 영문 혼합 텍스트를 유니코드 slug로 정규화한다", () => {
    expect(generateUnicodeSlug(" 안녕 Hello World! ")).toBe("안녕-hello-world");
  });

  it("legacy 빈 slug 또는 -숫자 slug 를 복구 대상으로 판단한다", () => {
    expect(needsLegacySlugRepair("")).toBe(true);
    expect(needsLegacySlugRepair("-2")).toBe(true);
    expect(needsLegacySlugRepair("정상-slug")).toBe(false);
  });
});
