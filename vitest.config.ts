import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@src": path.resolve(__dirname, "./src"),
      "@test": path.resolve(__dirname, "./test"),
      "@stub": path.resolve(__dirname, "./stub"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "test/",
        "build/",
        "*.config.ts",
        "**/*.d.ts",
      ],
    },
    // Phase S-0: smoke test만 실행 (기존 Mocha 테스트는 test:mocha 사용)
    include: ["test/smoke.test.ts"],
  },
});
