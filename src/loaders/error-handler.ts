import type { Express, NextFunction, Request, Response } from "express";
import { prodLog } from "@src/constants/console";
import { HttpException, HttpStatus } from "@src/core";

export function loadErrorHandler(app: Express) {
  app.use(function (
    error: Error,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: NextFunction,
  ) {
    prodLog.red(error);
    if (error instanceof HttpException) {
      return res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
    } else {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send({ success: false, message: "Internal Server Error" });
    }
  });
}
