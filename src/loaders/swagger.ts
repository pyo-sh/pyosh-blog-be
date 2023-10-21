import type { Express } from "express";
import * as swagger from "swagger-express-ts";
import swaggerUi from "swagger-ui-express";
import envs from "@src/constants/env";
import { NodeEnv } from "@src/constants/node-env";

export function loadSwagger(app: Express) {
  if (envs.NODE_ENV === NodeEnv.DEV) {
    // CAUTION: need to be defined first then swagger-ui-express
    // for serving swagger.json
    app.use(
      swagger.express({
        definition: {
          info: {
            title: "pyosh-blog API Docs",
            version: "1.0",
          },
        },
      }),
    );

    app.use(
      "/api-docs",
      swaggerUi.serve,
      swaggerUi.setup(null, { swaggerUrl: "/api-docs/swagger.json" }),
    );
  }
}
