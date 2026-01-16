import express, { Express } from "express";
import path from "path";
import { globSync } from "glob";
import Logger, { devLog, prodLog } from "@src/constants/console";
import RouteContainer from "@src/core/RouteContainer";

export function loadRouters(app: Express) {
  const router = express.Router();

  const queryPaths = new Set();
  const pattern = path.join(__dirname, "../domains", "./**/*.controller.ts");
  const routerFiles = globSync(pattern);

  routerFiles.forEach((fileName) => {
    try {
      // *: need to load Controllers (automatically)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const RouterClass = require(fileName)?.default;

      if (!RouterClass || !RouterClass?.prototype?.constructor) {
        return;
      }

      const controllerRouter = RouteContainer.createRouter(RouterClass);
      const controllerPrefix = RouteContainer.getRouterPrefix(RouterClass);

      if (queryPaths.has(controllerPrefix)) {
        throw new Error(
          `${Logger.RED_COLOR}Controller prefix: already existed path`,
        );
      }
      queryPaths.add(controllerPrefix);

      router.use(controllerPrefix, controllerRouter);
      devLog.cyan(`[Router] ${controllerPrefix} applied successfully`);
    } catch (e) {
      prodLog.red(`Router Error: loading router file (${fileName})`);
      console.error(e);
    }
  });

  prodLog.cyan("[Router] Initialized!");

  app.use("/api", router);
}
