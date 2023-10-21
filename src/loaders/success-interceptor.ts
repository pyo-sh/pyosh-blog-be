import { Express, NextFunction, Request, Response } from "express";

export function loadSuccessInterceptor(app: Express) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const originSend = res.send;

    res.send = (data) => {
      if (typeof data === "string" && /^\{.*\}$/.test(data)) {
        return originSend.call(res, data);
      }

      const success = !(
        data?.success === false && Object.hasOwnProperty.call(data, "message")
      );

      if (success) {
        return originSend.call(res, {
          success,
          data,
        });
      } else {
        return originSend.call(res, { success, message: data.message });
      }
    };

    next();
  });
}
