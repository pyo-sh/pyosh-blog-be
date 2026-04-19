import { config } from "dotenv";

export function loadEnvFiles(): void {
  // Vite/vitest injects BASE_URL="/" into process.env before module execution.
  // Remove it so the env schema can fall back to its computed default instead of
  // failing url() validation on a path-only string.
  if (process.env.BASE_URL === "/") {
    delete process.env.BASE_URL;
  }

  const NODE_ENV = process.env.NODE_ENV;
  const ENV_TARGET =
    NODE_ENV === "production"
      ? "production"
      : NODE_ENV === "test"
        ? "test"
        : "development";

  config();
  if (NODE_ENV) {
    const envPath =
      NODE_ENV === "test" ? `.env.test` : `.env.${ENV_TARGET}.local`;
    config({ path: envPath, override: true });
  }
}
