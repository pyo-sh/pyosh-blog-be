import path from "path";
import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import { prodLog } from "@src/constants/console";
import envs from "@src/constants/env";
import { NodeEnv } from "@src/constants/node-env";

export const typeormSource = new DataSource({
  type: "mysql",
  host: envs.DB_HOST,
  port: envs.DB_PORT,
  username: envs.DB_USER,
  password: envs.DB_PSWD,
  database: envs.DB_DTBS,
  entities: [path.join(__dirname, "../entities", `./**/*.entity.{js,ts}`)],
  logging: envs.NODE_ENV === NodeEnv.DEV,
  namingStrategy: new SnakeNamingStrategy(),
});

export async function loadTypeorm() {
  try {
    await typeormSource.initialize();
    prodLog.cyan("[TypeORM] Initialized!");
  } catch (err) {
    prodLog.red(`[TypeORM] Initialization Error : ${err}`);
    throw err;
  }
}
