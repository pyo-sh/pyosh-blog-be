import type { Express } from "express";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import logger from "morgan";
import envs from "@src/constants/env";

export function loadBase(app: Express) {
  if (envs.NODE_ENV === "development") {
    app.use(logger("dev"));
  }

  app.use(cookieParser());
  app.use(
    cors({
      origin: [envs.CLIENT_URL],
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
}
