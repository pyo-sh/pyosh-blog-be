import type { Express } from "express";
import path from "path";
import { globSync } from "glob";
import * as swagger from "swagger-express-ts";
import swaggerUi from "swagger-ui-express";
import envs from "@src/constants/env";
import { NodeEnv } from "@src/constants/node-env";

export function loadSwagger(app: Express) {
  if (envs.NODE_ENV === NodeEnv.DEV) {
    // *: need to load Swagger files (executing swagger-express-ts) (automatically)
    const pattern = path.join(__dirname, "../swagger", "./**/*.swagger.ts");
    const swaggerFiles = globSync(pattern);

    swaggerFiles.forEach((fileName) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require(fileName)?.default;
    });

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
