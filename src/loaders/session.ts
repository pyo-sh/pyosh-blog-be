import type { Express } from "express";
import session, { SessionOptions } from "express-session";
import { TypeormStore } from "typeorm-store";
import { prodLog } from "@src/constants/console";
import envs from "@src/constants/env";
import { SessionEntity } from "@src/entities/session.entity";
import { typeormSource } from "@src/loaders/typeorm";

export function loadSession(app: Express) {
  const repository = typeormSource.getRepository(SessionEntity);

  app.use(
    session({
      secret: envs.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: new TypeormStore({
        repository,
      }) as unknown as SessionOptions["store"],
      cookie: {
        secure: envs.CLIENT_PROTOCOL === "https",
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );
  prodLog.cyan("[Session] Initialized!");
}
