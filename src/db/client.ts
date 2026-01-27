import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema/index";
import envs from "@src/constants/env";

/**
 * MySQL2 Connection Pool
 */
export const connection = mysql.createPool({
  host: envs.DB_HOST,
  port: envs.DB_PORT,
  user: envs.DB_USER,
  password: envs.DB_PSWD,
  database: envs.DB_DTBS,
});

/**
 * Drizzle ORM Client
 */
export const db = drizzle(connection, { schema, mode: "default" });
