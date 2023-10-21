import type { Express } from "express";
import session from "express-session";
import Sinon from "sinon";
import envs from "@src/constants/env";
import * as SessionLoader from "@src/loaders/session";

export function initTestSession() {
  const loadSessionStub = Sinon.stub(SessionLoader, "loadSession").callsFake(
    (app: Express) => {
      app.use(
        session({
          secret: envs.SESSION_SECRET,
          resave: false,
          saveUninitialized: false,
        }),
      );
    },
  );

  Sinon.replace(SessionLoader, "loadSession", loadSessionStub);
}
