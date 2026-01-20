import { describe, it, expect } from "vitest";

describe("Vitest Smoke Test", () => {
  it("should work", () => {
    expect(true).toBe(true);
  });

  it("should support async tests", async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });
});
