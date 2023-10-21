import express from "express";
import type { Express } from "express";
import http from "http";
import { loadErrorHandler } from "./loaders/error-handler";
import { loadSwagger } from "./loaders/swagger";
import { prodLog } from "@src/constants/console";
import envs from "@src/constants/env";
import { loadBase } from "@src/loaders/base";
import { loadPassport } from "@src/loaders/passport";
import { loadRouters } from "@src/loaders/router";
import { loadSession } from "@src/loaders/session";
import { loadTypeorm } from "@src/loaders/typeorm";
import "express-async-errors";

const app = (function listenServer() {
  const app = express();
  const server = http.createServer(app);
  app.set("port", envs.SERVER_PORT);

  const loaders: Array<(app: Express) => Promise<void> | void> = [
    loadBase,
    loadTypeorm,
    loadSession,
    loadPassport,
    loadRouters,
    loadErrorHandler,
    loadSwagger,
  ];

  loaders.reduce(async (promise, loader) => {
    return promise.then(() => loader(app));
  }, Promise.resolve());

  server.listen(envs.SERVER_PORT);
  server.on("listening", () => {
    const addr = server.address();
    const bind =
      typeof addr === "string" ? `pipe ${addr}` : `port ${addr.port}`;
    prodLog.cyan(`[Express] Listening on ${bind}`);
  });

  return app;
})();

export default app;
