import type { Config } from "drizzle-kit";
import { env } from "./src/shared/env";

export default {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PSWD,
    database: env.DB_DTBS,
  },
} satisfies Config;
