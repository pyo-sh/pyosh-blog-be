import { config } from "dotenv";

type DbEnv = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function loadEnv() {
  config();

  const nodeEnv = process.env.NODE_ENV;
  const envTarget =
    nodeEnv === "production"
      ? "production"
      : nodeEnv === "test"
        ? "test"
        : "development";

  if (nodeEnv) {
    const envPath =
      nodeEnv === "test" ? ".env.test" : `.env.${envTarget}.local`;
    config({ path: envPath, override: true });
  }
}

export function requireDbEnv(context: string): DbEnv {
  const { DB_HOST, DB_PORT, DB_USER, DB_PSWD, DB_DTBS } = process.env;

  if (!DB_HOST || !DB_PORT || !DB_USER || !DB_PSWD || !DB_DTBS) {
    throw new Error(
      `[${context}] Missing required DB envs: DB_HOST, DB_PORT, DB_USER, DB_PSWD, DB_DTBS`,
    );
  }

  return {
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PSWD,
    database: DB_DTBS,
  };
}
