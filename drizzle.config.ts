import type { Config } from "drizzle-kit";
import envs from "./src/constants/env";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: envs.DB_HOST,
    port: envs.DB_PORT,
    user: envs.DB_USER,
    password: envs.DB_PSWD,
    database: envs.DB_DTBS,
  },
} satisfies Config;
