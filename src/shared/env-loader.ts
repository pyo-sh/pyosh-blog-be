import { config } from "dotenv";

export function loadEnvFiles(): void {
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
