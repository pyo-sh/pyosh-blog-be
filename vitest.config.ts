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
    globalSetup: ["./test/setup.ts"],
    testTimeout: 10000,
    env: {
      NODE_ENV: "test",
    },
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
    include: ["test/**/*.test.ts"],
  },
});
